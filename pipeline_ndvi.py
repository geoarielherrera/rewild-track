"""
ForestVerify — Pipeline NDVI automático con Sentinel-2 y Google Earth Engine.
Soporta cálculo de baseline pre-plantación (2 años, 4 ventanas) y
frecuencias de verificación (trimestral, semestral, anual).

CAMBIOS respecto a la versión anterior:
  1. El fallback de baseline ya NO es un valor hardcodeado (0.2). Ahora busca
     hacia atrás la imagen disponible más cercana a la fecha de plantación.
  2. Se agrega un "snapshot" de NDVI en la fecha de plantación (±15 días) para
     que el certificado tenga un NDVI actual disponible inmediatamente al
     cargar el proyecto, sin esperar el primer intervalo de seguimiento
     (que puede tardar 3, 6 o 12 meses según la frecuencia).
  3. Se corrige un bug en get_post_planting_intervals que generaba ventanas
     de fecha inicio = fecha fin (0 días) cuando planting_date == hoy,
     lo cual Earth Engine no resuelve (filterDate es [start, end)).
  4. Se valida la frecuencia recibida contra {'trimestral','semestral','anual'}.
"""

import ee
import json
import hashlib
import datetime
from datetime import date
from dateutil.relativedelta import relativedelta
import os
from supabase import create_client

# ── Configuración ──────────────────────────────────────────────
GEE_PROJECT  = 'siempremonte'
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_KEY')

FRECUENCIAS_VALIDAS = ('trimestral', 'semestral', 'anual')

# Período mínimo desde la plantación antes de emitir un estado de éxito/fracaso.
# Antes de esto, el certificado muestra "En evaluación" en vez de arriesgar una
# etiqueta negativa/positiva basada en ruido de medición.
GRACE_PERIODO_DIAS = 180

# ── Inicializar Earth Engine ───────────────────────────────────
key_data = os.environ.get('GEE_SERVICE_ACCOUNT_KEY')
if key_data:
    key_path = '/tmp/gee_key.json'
    with open(key_path, 'w') as f:
        f.write(key_data)
    key_info    = json.loads(key_data)
    credentials = ee.ServiceAccountCredentials(
        email    = key_info['client_email'],
        key_file = key_path
    )
    ee.Initialize(credentials=credentials, project=GEE_PROJECT)
    print("✓ Earth Engine inicializado con cuenta de servicio")
else:
    ee.Initialize(project=GEE_PROJECT)
    print("✓ Earth Engine inicializado con credenciales locales")

# ── Inicializar Supabase ───────────────────────────────────────
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── Cálculos ecológicos ────────────────────────────────────────
def calc_biomass(ndvi, area_ha):
    import math
    agb = max(0, math.exp(2.13 * ndvi) - 1)
    return round(agb * area_ha * 1.28, 1)

def calc_carbon(biomass):
    return round(biomass * 0.47 * 3.67, 1)

def classify_status(delta_ndvi, green_gain, dias_desde_plantacion):
    """
    dias_desde_plantacion: días transcurridos entre la fecha de plantación y hoy.
    Durante el período de gracia (GRACE_PERIODO_DIAS) el delta de NDVI puede ser
    negativo o cercano a cero solo por ruido de la medición satelital (nubes,
    ángulo de toma, estacionalidad), no porque el proyecto haya fallado. Por eso
    no se etiqueta como Exitoso/En desarrollo/En riesgo/Fallido hasta que pasó
    tiempo suficiente para que la vegetación muestre un cambio real.
    """
    if delta_ndvi is None:
        return 'Sin datos suficientes'
    if dias_desde_plantacion < GRACE_PERIODO_DIAS:
        return 'En evaluación'
    if delta_ndvi >= 0.2 and green_gain >= 20: return 'Exitoso'
    if delta_ndvi >= 0.1 or green_gain >= 10:  return 'En desarrollo'
    if delta_ndvi >= 0:                         return 'En riesgo'
    return 'Fallido'

# ── Obtener imagen representativa de un rango de fechas ────────
def get_single_ndvi_point(aoi, start_date_str, end_date_str, label=""):
    """
    Obtiene la imagen con menor cobertura de nubes en un rango de fechas
    y calcula la media de NDVI en la geometría.
    """
    try:
        collection = (
            ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
            .filterBounds(aoi)
            .filterDate(start_date_str, end_date_str)
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 25))
            .sort('CLOUDY_PIXEL_PERCENTAGE')
        )

        if collection.size().getInfo() == 0:
            return None

        # Tomamos la mejor imagen (menor porcentaje de nubes)
        img = collection.first()
        ndvi = img.normalizedDifference(['B8', 'B4']).rename('NDVI')
        img_date = ee.Date(img.get('system:time_start')).format('YYYY-MM-dd').getInfo()
        cloud = img.get('CLOUDY_PIXEL_PERCENTAGE').getInfo()
        img_id = img.get('system:index').getInfo()

        stats = ndvi.reduceRegion(
            reducer   = ee.Reducer.mean()
                          .combine(ee.Reducer.min(), sharedInputs=True)
                          .combine(ee.Reducer.max(), sharedInputs=True)
                          .combine(ee.Reducer.stdDev(), sharedInputs=True),
            geometry  = aoi,
            scale     = 10,
            maxPixels = 1e9
        ).getInfo()

        green_pct = ndvi.gt(0.3).reduceRegion(ee.Reducer.mean(), aoi, 10).getInfo().get('NDVI', 0) or 0

        return {
            'date':            img_date,
            'ndvi_mean':       round(float(stats.get('NDVI_mean') or 0), 4),
            'ndvi_min':        round(float(stats.get('NDVI_min') or 0), 4),
            'ndvi_max':        round(float(stats.get('NDVI_max') or 0), 4),
            'ndvi_std':        round(float(stats.get('NDVI_stdDev') or 0), 4),
            'green_cover_pct': round(float(green_pct) * 100, 2),
            'cloud_cover':     round(float(cloud or 0), 1),
            'image_id':        img_id,
            'image_hash':      hashlib.sha256(img_id.encode()).hexdigest()[:12],
            'period_type':     label
        }
    except Exception as e:
        print(f"    Error al procesar rango {start_date_str} a {end_date_str}: {e}")
        return None

# ── Generar fechas para el Baseline (2 años anteriores, Enero y Agosto) ──────
def get_baseline_dates(planting_date):
    p_year = planting_date.year
    baseline_windows = []

    for yr in [p_year - 2, p_year - 1]:
        # Ventana Enero (15 Ene - 15 Feb)
        baseline_windows.append((
            f"{yr}-01-15", f"{yr}-02-15", f"baseline_{yr}_Enero"
        ))
        # Ventana Agosto (15 Ago - 15 Sep)
        baseline_windows.append((
            f"{yr}-08-15", f"{yr}-09-15", f"baseline_{yr}_Agosto"
        ))
    return baseline_windows

# ── Fallback de baseline: última imagen disponible antes de la plantación ────
def get_pre_planting_fallback(aoi, planting_date):
    """
    Si ninguna de las 4 ventanas Enero/Agosto de los 2 años previos tiene
    imagen utilizable (nubes, falta de cobertura Sentinel, etc.), buscamos
    hacia atrás la imagen disponible más cercana a la fecha de plantación,
    ampliando la ventana de búsqueda hasta encontrar algo.
    """
    ventanas_dias = [30, 90, 180, 365, 730]
    for dias in ventanas_dias:
        start = (planting_date - datetime.timedelta(days=dias)).isoformat()
        end   = planting_date.isoformat()
        rec = get_single_ndvi_point(aoi, start, end, "baseline_fallback")
        if rec:
            return rec
    return None

# ── Snapshot inmediato en la fecha de plantación ──────────────────────────
def get_planting_date_snapshot(aoi, planting_date):
    """
    Imagen más cercana a la fecha de plantación. Garantiza que el certificado
    tenga un "NDVI actual" disponible apenas se carga el proyecto, sin
    depender del primer intervalo de seguimiento (que puede tardar hasta 12
    meses si la frecuencia es anual).

    Primero intenta ±15 días con la nubosidad recomendada (<25%, aplicada
    dentro de get_single_ndvi_point). Si no hay ninguna imagen que cumpla
    ese criterio en esa ventana, amplía progresivamente la búsqueda
    (±30, ±60, ±90, ±180 días) y se queda con la menos nublada disponible
    en la primera ventana que sí tenga resultado — es decir, la más cercana
    posible a la fecha de plantación.
    """
    ventanas_dias = [15, 30, 60, 90, 180]
    for dias in ventanas_dias:
        start = (planting_date - datetime.timedelta(days=dias)).isoformat()
        end   = (planting_date + datetime.timedelta(days=dias)).isoformat()
        rec = get_single_ndvi_point(aoi, start, end, "planting_snapshot")
        if rec:
            if dias > 15:
                print(f"    (sin imagen limpia en ±15 días, se amplió a ±{dias} días)")
            return rec
    return None

# ── Generar rangos de fechas post-plantación según frecuencia ────────────────
def get_post_planting_intervals(planting_date, end_date, frequency):
    step_months = 3 if frequency == 'trimestral' else (6 if frequency == 'semestral' else 12)
    current = planting_date
    intervals = []

    while current <= end_date:
        next_date = current + relativedelta(months=step_months)
        win_end = min(next_date, end_date)
        # Evita ventanas de 0 días (start == end), que Earth Engine no resuelve
        # porque filterDate() usa un intervalo semi-abierto [start, end).
        if win_end > current:
            intervals.append((
                current.isoformat(),
                win_end.isoformat(),
                f"tracking_{frequency}"
            ))
        current = next_date

    return intervals

# ── Procesar un proyecto ───────────────────────────────────────
def process_project(project):
    pid           = project['id']
    name          = project['name']
    area_ha       = float(project.get('area_ha') or 0)
    polygon       = project.get('polygon')
    trees_planted = project.get('trees_planted') or 0

    # Manejo de la fecha de plantación
    planting_str  = project.get('planting_date') or datetime.date.today().isoformat()
    planting_date = datetime.datetime.strptime(planting_str, "%Y-%m-%d").date()

    # Frecuencia: trimestral, semestral o anual (por defecto semestral)
    frequency = (project.get('verification_frequency') or 'semestral').lower()
    if frequency not in FRECUENCIAS_VALIDAS:
        print(f"  ⚠ Frecuencia inválida '{frequency}' — usando 'semestral' por defecto")
        frequency = 'semestral'

    print(f"\n{'='*50}")
    print(f"Proyecto: {pid} — {name}")
    print(f"Fecha de Plantación: {planting_date} | Frecuencia: {frequency}")

    if not polygon:
        print("  Sin polígono — saltando")
        return

    try:
        aoi = ee.Geometry(polygon)
    except Exception as e:
        print(f"  Error en la geometría del polígono: {e}")
        return

    records = []

    # 1. Procesar Baseline (2 años antes, 4 imágenes: Enero/Agosto)
    print("  ► Calculando Baseline Pre-plantación (4 imágenes)...")
    baseline_windows = get_baseline_dates(planting_date)
    baseline_records = []

    for s_date, e_date, label in baseline_windows:
        rec = get_single_ndvi_point(aoi, s_date, e_date, label)
        if rec:
            baseline_records.append(rec)
            records.append(rec)
            print(f"    ✓ Baseline {rec['date']} — NDVI: {rec['ndvi_mean']}")

    if baseline_records:
        # Promedio de las imágenes encontradas en las ventanas Ene/Ago (hasta 4)
        baseline_ndvi  = sum(r['ndvi_mean'] for r in baseline_records) / len(baseline_records)
        baseline_green = sum(r['green_cover_pct'] for r in baseline_records) / len(baseline_records)
        print(f"  ★ NDVI Baseline (promedio de {len(baseline_records)} imágenes): {round(baseline_ndvi, 4)}")
    else:
        # Sin cobertura en las 4 ventanas → buscamos la última imagen disponible
        # antes de la plantación en vez de inventar un valor.
        print("    Sin imágenes en las ventanas Ene/Ago — buscando última imagen pre-plantación...")
        fallback = get_pre_planting_fallback(aoi, planting_date)
        if fallback:
            baseline_ndvi  = fallback['ndvi_mean']
            baseline_green = fallback['green_cover_pct']
            records.append(fallback)
            print(f"  ★ NDVI Baseline (fallback, imagen del {fallback['date']}): {baseline_ndvi}")
        else:
            baseline_ndvi  = None
            baseline_green = None
            print("  ⚠ No se encontró ninguna imagen pre-plantación disponible. Baseline no calculable.")

    # 2. Snapshot inmediato en la fecha de plantación
    #    (para que el certificado ya tenga un NDVI "actual" apenas se carga el proyecto)
    print("  ► Buscando imagen cercana a la fecha de plantación...")
    snapshot = get_planting_date_snapshot(aoi, planting_date)
    if snapshot:
        records.append(snapshot)
        print(f"    ✓ Snapshot plantación {snapshot['date']} — NDVI: {snapshot['ndvi_mean']}")
    else:
        print("    Sin imagen disponible en ±15 días de la fecha de plantación")

    # 3. Procesar Histórico / Seguimiento desde la Fecha de Plantación
    print(f"  ► Calculando serie post-plantación ({frequency})...")
    today = datetime.date.today()
    post_intervals = get_post_planting_intervals(planting_date, today, frequency)

    for s_date, e_date, label in post_intervals:
        rec = get_single_ndvi_point(aoi, s_date, e_date, label)
        if rec:
            records.append(rec)
            print(f"    ✓ Tracking {rec['date']} — NDVI: {rec['ndvi_mean']}")

    if not records:
        print("  Sin registros NDVI generados.")
        return

    # Guardar todos los registros NDVI generados en la base de datos
    for r in records:
        r['project_id'] = pid
        # Limpiamos 'period_type' si la columna no existe en la BD
        data_to_upsert = {k: v for k, v in r.items() if k != 'period_type'}
        supabase.table('ndvi_records').upsert(data_to_upsert, on_conflict='project_id,date').execute()

    # 4. Obtener NDVI Actual (la imagen más reciente entre baseline/snapshot/tracking)
    records_sorted = sorted(records, key=lambda x: x['date'])
    current_record = records_sorted[-1]
    current_ndvi   = current_record['ndvi_mean']

    if baseline_ndvi is not None:
        delta_ndvi = round(current_ndvi - baseline_ndvi, 4)
        green_gain = round(current_record['green_cover_pct'] - baseline_green, 2)
        survival    = min(0.95, max(0, 0.3 + delta_ndvi * 2))
    else:
        delta_ndvi = None
        green_gain = 0
        survival   = None

    biomass      = calc_biomass(current_ndvi, area_ha)
    co2_kg       = round(calc_carbon(biomass) * 1000, 1)
    trees_alive  = int(trees_planted * survival) if survival is not None else None
    dias_desde_plantacion = (today - planting_date).days
    status       = classify_status(delta_ndvi, green_gain, dias_desde_plantacion)

    # 5. Guardar o actualizar el Certificado de Verificación Satelital
    report = {
        'project_id':            pid,
        'report_date':           today.isoformat(),
        'baseline_ndvi':         round(baseline_ndvi, 4) if baseline_ndvi is not None else None,
        'current_ndvi':          round(current_ndvi, 4),
        'delta_ndvi':            delta_ndvi,
        'green_cover_gain_pct':  green_gain,
        'estimated_trees_alive': trees_alive,
        'estimated_co2_kg':      co2_kg,
        'success_rate_pct':      round(survival * 100, 1) if survival is not None else None,
        'status':                status,
        'area_ha':               area_ha,
        'methodology':           f'Baseline pre-plantación (2 años, imágenes Enero/Agosto, con fallback a última imagen disponible). Verificación {frequency} vía Sentinel-2 L2A.',
        'report_hash':           hashlib.sha256(f"{pid}{today}{current_ndvi}".encode()).hexdigest(),
    }

    supabase.table('verification_reports').upsert(report, on_conflict='project_id,report_date').execute()
    print(f"  ✓ Certificado actualizado — Estado: {status} | Baseline: {report['baseline_ndvi']} | Actual: {current_ndvi}")

# ── Main ───────────────────────────────────────────────────────
def main():
    print("ForestVerify — Pipeline NDVI")
    print(f"Fecha: {datetime.date.today()}")

    res = supabase.table('projects')\
        .select('id, name, area_ha, trees_planted, polygon, planting_date, verification_frequency')\
        .execute()
    projects = res.data
    print(f"\nProyectos encontrados: {len(projects)}")

    for project in projects:
        try:
            process_project(project)
        except Exception as e:
            print(f"Error procesando proyecto {project['id']}: {e}")

    print(f"\n{'='*50}")
    print("Pipeline completado.")

if __name__ == '__main__':
    main()