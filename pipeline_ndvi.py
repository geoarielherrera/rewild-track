"""
ForestVerify — Pipeline NDVI automático con Sentinel-2 y Google Earth Engine.
Metodología: Mediana Estival (15 Ene - 28 Feb) para eliminación de ruido invernal.
"""

import ee
import json
import hashlib
import datetime
from datetime import date
import os
from supabase import create_client

# ── Configuración ──────────────────────────────────────────────
GEE_PROJECT  = 'siempremonte'
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_KEY')

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

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── Cálculos ecológicos ────────────────────────────────────────
def calc_biomass(ndvi, area_ha):
    import math
    agb = max(0, math.exp(2.13 * ndvi) - 1)
    return round(agb * area_ha * 1.28, 1)

def calc_carbon(biomass):
    return round(biomass * 0.47 * 3.67, 1)

def classify_status(delta_ndvi, green_gain, dias_desde_plantacion):
    if delta_ndvi is None:
        return 'Sin datos suficientes'
    if dias_desde_plantacion < GRACE_PERIODO_DIAS:
        return 'En evaluación'
    if delta_ndvi >= 0.20 and green_gain >= 20: return 'Exitoso'
    if delta_ndvi >= 0.10 or green_gain >= 10:  return 'En desarrollo'
    if delta_ndvi >= 0:                         return 'En riesgo'
    return 'Fallido'

# ── Obtener Compuesto de Mediana Estival ───────────────────────
def get_summer_median_ndvi(aoi, year, label=""):
    """
    Calcula la mediana píxel a píxel del NDVI para la ventana estival
    (15 de Enero al 28 de Febrero) del año especificado.
    """
    start_date = f"{year}-01-15"
    end_date   = f"{year}-02-28"

    try:
        # Colección de imágenes estivales filtradas por nubosidad
        collection = (
            ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
            .filterBounds(aoi)
            .filterDate(start_date, end_date)
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
            .map(lambda img: img.normalizedDifference(['B8', 'B4']).rename('NDVI'))
        )

        count = collection.size().getInfo()
        if count == 0:
            print(f"    ⚠ Sin imágenes estivales válidas para {year}")
            return None

        # Compuesto píxel a píxel por mediana
        ndvi_median = collection.median()

        stats = ndvi_median.reduceRegion(
            reducer   = ee.Reducer.mean()
                         .combine(ee.Reducer.min(), sharedInputs=True)
                         .combine(ee.Reducer.max(), sharedInputs=True)
                         .combine(ee.Reducer.stdDev(), sharedInputs=True),
            geometry  = aoi,
            scale     = 10,
            maxPixels = 1e9
        ).getInfo()

        green_pct = ndvi_median.gt(0.3).reduceRegion(ee.Reducer.mean(), aoi, 10).getInfo().get('NDVI', 0) or 0
        ndvi_mean = float(stats.get('NDVI_mean') or 0)

        # Generar hash sintético representativo de la temporada estival
        period_id = f"SUMMER_{year}_{aoi.toGeoJSONString()[:30]}"
        img_hash  = hashlib.sha256(period_id.encode()).hexdigest()[:12]

        return {
            'date':             f"{year}-02-15",  # Fecha representativa del centro del verano
            'year':             year,
            'ndvi_mean':        round(ndvi_mean, 4),
            'ndvi_min':         round(float(stats.get('NDVI_min') or 0), 4),
            'ndvi_max':         round(float(stats.get('NDVI_max') or 0), 4),
            'ndvi_std':         round(float(stats.get('NDVI_stdDev') or 0), 4),
            'green_cover_pct':  round(float(green_pct) * 100, 2),
            'cloud_cover':      0.0,  # La mediana elimina nubosidad aislada
            'image_id':         f"SENTINEL2_SUMMER_MEDIAN_{year}",
            'image_hash':       img_hash,
            'period_type':      label
        }
    except Exception as e:
        print(f"    Error al procesar ventana de verano {year}: {e}")
        return None

# ── Procesar un proyecto ───────────────────────────────────────
def process_project(project):
    pid           = project['id']
    name          = project['name']
    area_ha       = float(project.get('area_ha') or 0)
    polygon       = project.get('polygon')
    trees_planted = project.get('trees_planted') or 0

    planting_str  = project.get('planting_date') or datetime.date.today().isoformat()
    planting_date = datetime.datetime.strptime(planting_str, "%Y-%m-%d").date()
    p_year        = planting_date.year

    print(f"\n{'='*50}")
    print(f"Proyecto: {pid} — {name}")
    print(f"Fecha de Plantación: {planting_date} (Año: {p_year})")

    if not polygon:
        print("  Sin polígono — saltando")
        return

    try:
        aoi = ee.Geometry(polygon)
    except Exception as e:
        print(f"  Error en la geometría del polígono: {e}")
        return

    records = []

    # 1. Baseline Pre-plantación (Mediana estival de los 2 veranos anteriores)
    print("  ► Calculando Baseline Estival Pre-plantación (2 veranos previas)...")
    baseline_records = []
    
    for yr in [p_year - 2, p_year - 1]:
        rec = get_summer_median_ndvi(aoi, yr, f"baseline_verano_{yr}")
        if rec:
            baseline_records.append(rec)
            records.append(rec)
            print(f"    ✓ Verano {yr} — NDVI Mediano: {rec['ndvi_mean']}")

    if baseline_records:
        baseline_ndvi  = sum(r['ndvi_mean'] for r in baseline_records) / len(baseline_records)
        baseline_green = sum(r['green_cover_pct'] for r in baseline_records) / len(baseline_records)
        print(f"  ★ Baseline NDVI (Promedio Estival): {round(baseline_ndvi, 4)}")
    else:
        baseline_ndvi  = None
        baseline_green = None
        print("  ⚠ Sin imágenes estivales pre-plantación suficientes.")

    # 2. Seguimiento Post-plantación (Evaluación estival año a año)
    today = datetime.date.today()
    current_year = today.year
    print(f"  ► Calculando serie estival post-plantación ({p_year} a {current_year})...")

    # Solo evaluar años estivales que ya hayan concluido la ventana de febrero
    for yr in range(p_year, current_year + 1):
        # Si estamos en el año actual pero aún no terminó febrero, no procesar verano incompleto
        if yr == current_year and today < datetime.date(current_year, 3, 1):
            continue

        rec = get_summer_median_ndvi(aoi, yr, f"tracking_verano_{yr}")
        if rec:
            records.append(rec)
            print(f"    ✓ Tracking Verano {yr} — NDVI Mediano: {rec['ndvi_mean']}")

    if not records:
        print("  Sin registros NDVI generados.")
        return

    # Guardar registros en la base de datos
    for r in records:
        r['project_id'] = pid
        data_to_upsert = {k: v for k, v in r.items() if k not in ['period_type', 'year']}
        supabase.table('ndvi_records').upsert(data_to_upsert, on_conflict='project_id,date').execute()

    # 3. Obtener NDVI Actual (Mediana de la temporada estival más reciente)
    records_sorted = sorted(records, key=lambda x: x['date'])
    current_record = records_sorted[-1]
    current_ndvi   = current_record['ndvi_mean']

    if baseline_ndvi is not None:
        delta_ndvi = round(current_ndvi - baseline_ndvi, 4)
        green_gain = round(current_record['green_cover_pct'] - baseline_green, 2)
        survival   = min(0.95, max(0, 0.3 + delta_ndvi * 2))
    else:
        delta_ndvi = None
        green_gain = 0
        survival   = None

    biomass               = calc_biomass(current_ndvi, area_ha)
    co2_kg                = round(calc_carbon(biomass) * 1000, 1)
    trees_alive           = int(trees_planted * survival) if survival is not None else None
    dias_desde_plantacion = (today - planting_date).days
    status                = classify_status(delta_ndvi, green_gain, dias_desde_plantacion)

    # 4. Guardar Reporte/Certificado
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
        'methodology':           'Mediana estival interanual (15 Ene - 28 Feb) vía Sentinel-2 L2A.',
        'report_hash':           hashlib.sha256(f"{pid}{today}{current_ndvi}".encode()).hexdigest(),
    }

    supabase.table('verification_reports').upsert(report, on_conflict='project_id,report_date').execute()
    print(f"  ✓ Certificado actualizado — Estado: {status} | Baseline $T_0$: {report['baseline_ndvi']} | NDVI Actual: {current_ndvi} (ΔNDVI: {delta_ndvi})")

def main():
    print("ForestVerify — Pipeline NDVI (Filtro Estival)")
    print(f"Fecha de ejecución: {datetime.date.today()}")

    res = supabase.table('projects')\
        .select('id, name, area_ha, trees_planted, polygon, planting_date')\
        .execute()
    projects = res.data

    for project in projects:
        try:
            process_project(project)
        except Exception as e:
            print(f"Error procesando proyecto {project['id']}: {e}")

if __name__ == '__main__':
    main()