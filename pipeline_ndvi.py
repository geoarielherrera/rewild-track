"""
pipeline_ndvi.py
Calcula NDVI automático con Sentinel-2 via Google Earth Engine
y guarda los resultados en Supabase.

Uso: python pipeline_ndvi.py
"""

import ee
import json
import hashlib
import datetime
import os
from supabase import create_client

# ── Configuración ──────────────────────────────────────────────
GEE_PROJECT    = 'siempremonte'
SUPABASE_URL   = os.environ.get('SUPABASE_URL')
SUPABASE_KEY   = os.environ.get('SUPABASE_KEY')

# ── Inicializar clientes ───────────────────────────────────────
ee.Initialize(project=GEE_PROJECT)
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── Cálculos ecológicos ────────────────────────────────────────
def calc_biomass(ndvi, area_ha):
    import math
    agb = max(0, math.exp(2.13 * ndvi) - 1)
    return round(agb * area_ha * 1.28, 1)

def calc_carbon(biomass):
    return round(biomass * 0.47 * 3.67, 1)

def classify_status(delta_ndvi, green_gain):
    if delta_ndvi >= 0.2 and green_gain >= 20: return 'Exitoso'
    if delta_ndvi >= 0.1 or green_gain >= 10:  return 'En desarrollo'
    if delta_ndvi >= 0:                         return 'En riesgo'
    return 'Fallido'

# ── Calcular NDVI de un polígono en una fecha ──────────────────
def get_ndvi_stats(polygon_geojson, start_date, end_date):
    """
    Retorna lista de registros NDVI entre start_date y end_date.
    """
    try:
        aoi = ee.Geometry(polygon_geojson)
    except Exception as e:
        print(f"  Error al crear geometría: {e}")
        return []

    collection = (
        ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(aoi)
        .filterDate(start_date, end_date)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
    )

    size = collection.size().getInfo()
    print(f"  Imágenes disponibles: {size}")
    if size == 0:
        return []

    records = []
    images  = collection.toList(min(size, 10))  # máximo 10 por ejecución

    for i in range(images.size().getInfo()):
        try:
            img  = ee.Image(images.get(i))
            ndvi = img.normalizedDifference(['B8', 'B4']).rename('NDVI')
            date = ee.Date(img.get('system:time_start')).format('YYYY-MM-dd').getInfo()
            cloud = img.get('CLOUDY_PIXEL_PERCENTAGE').getInfo()
            img_id = img.get('system:index').getInfo()

            stats = ndvi.reduceRegion(
                reducer=ee.Reducer.mean()
                    .combine(ee.Reducer.min(), sharedInputs=True)
                    .combine(ee.Reducer.max(), sharedInputs=True)
                    .combine(ee.Reducer.stdDev(), sharedInputs=True),
                geometry=aoi,
                scale=10,
                maxPixels=1e9
            ).getInfo()

            green_mask = ndvi.gt(0.3)
            dense_mask = ndvi.gt(0.5)
            green_pct  = green_mask.reduceRegion(ee.Reducer.mean(), aoi, 10).getInfo().get('NDVI', 0) or 0
            dense_pct  = dense_mask.reduceRegion(ee.Reducer.mean(), aoi, 10).getInfo().get('NDVI', 0) or 0

            records.append({
                'date':            date,
                'ndvi_mean':       round(float(stats.get('NDVI_mean') or 0), 4),
                'ndvi_min':        round(float(stats.get('NDVI_min')  or 0), 4),
                'ndvi_max':        round(float(stats.get('NDVI_max')  or 0), 4),
                'ndvi_std':        round(float(stats.get('NDVI_stdDev') or 0), 4),
                'green_cover_pct': round(float(green_pct) * 100, 2),
                'dense_veg_pct':   round(float(dense_pct) * 100, 2),
                'cloud_cover':     round(float(cloud or 0), 1),
                'image_id':        img_id,
                'image_hash':      hashlib.sha256(img_id.encode()).hexdigest()[:12],
            })
            print(f"  ✓ {date} — NDVI: {records[-1]['ndvi_mean']}")

        except Exception as e:
            print(f"  Error en imagen {i}: {e}")
            continue

    return records

# ── Procesar un proyecto ───────────────────────────────────────
def process_project(project):
    pid      = project['id']
    name     = project['name']
    area_ha  = float(project.get('area_ha') or 0)
    polygon  = project.get('polygon')

    print(f"\n{'='*50}")
    print(f"Proyecto: {pid} — {name}")

    if not polygon:
        print("  Sin polígono — saltando")
        return

    # Fechas: último mes
    today      = datetime.date.today()
    start_date = (today - datetime.timedelta(days=35)).isoformat()
    end_date   = today.isoformat()

    print(f"  Período: {start_date} → {end_date}")

    records = get_ndvi_stats(polygon, start_date, end_date)

    if not records:
        print("  Sin imágenes disponibles para este período")
        return

    # Guardar registros NDVI en Supabase
    for r in records:
        r['project_id'] = pid
        supabase.table('ndvi_records').upsert(r, on_conflict='project_id,date').execute()

    # Calcular reporte de verificación
    current_ndvi = records[-1]['ndvi_mean']

    # Obtener baseline (promedio histórico)
    baseline_res = supabase.table('ndvi_records')\
        .select('ndvi_mean')\
        .eq('project_id', pid)\
        .order('date')\
        .limit(3)\
        .execute()

    baseline_ndvi = sum(r['ndvi_mean'] for r in baseline_res.data) / len(baseline_res.data) if baseline_res.data else current_ndvi * 0.5
    delta_ndvi    = round(current_ndvi - baseline_ndvi, 4)
    green_gain    = records[-1]['green_cover_pct'] - (baseline_res.data[0].get('green_cover_pct', 0) if baseline_res.data else 0)
    biomass       = calc_biomass(current_ndvi, area_ha)
    co2_kg        = calc_carbon(biomass) * 1000
    trees_planted = project.get('trees_planted') or 0
    survival      = min(0.95, max(0, 0.3 + delta_ndvi * 2))
    trees_alive   = int(trees_planted * survival)
    status        = classify_status(delta_ndvi, green_gain)

    report = {
        'project_id':             pid,
        'report_date':            today.isoformat(),
        'baseline_ndvi':          round(baseline_ndvi, 4),
        'current_ndvi':           round(current_ndvi, 4),
        'delta_ndvi':             delta_ndvi,
        'green_cover_gain_pct':   round(green_gain, 2),
        'estimated_trees_alive':  trees_alive,
        'estimated_co2_kg':       round(co2_kg, 1),
        'success_rate_pct':       round(survival * 100, 1),
        'status':                 status,
        'area_ha':                area_ha,
        'methodology':            'NDVI derivado de Sentinel-2 L2A (ESA Copernicus, 10m/px). Baseline: promedio de primeras imágenes disponibles. CO₂ estimado via relación empírica AGB-NDVI.',
        'report_hash':            hashlib.sha256(f"{pid}{today}{current_ndvi}".encode()).hexdigest(),
    }

    supabase.table('verification_reports').upsert(report, on_conflict='project_id,report_date').execute()

    print(f"  ✓ Reporte guardado — Estado: {status} — NDVI: {current_ndvi} — CO₂: {co2_kg:.0f} kg")

# ── Main ───────────────────────────────────────────────────────
def main():
    print("ForestVerify — Pipeline NDVI")
    print(f"Fecha: {datetime.date.today()}")

    # Obtener todos los proyectos con polígono
    res = supabase.table('projects')\
        .select('id, name, area_ha, trees_planted, polygon, planting_date')\
        .execute()

    projects = res.data
    print(f"\nProyectos encontrados: {len(projects)}")

    for project in projects:
        try:
            process_project(project)
        except Exception as e:
            print(f"Error en {project['id']}: {e}")

    print(f"\n{'='*50}")
    print("Pipeline completado.")

if __name__ == '__main__':
    main()