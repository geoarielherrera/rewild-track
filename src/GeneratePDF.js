import jsPDF from 'jspdf'

// ── Helpers ───────────────────────────────────────────────────
function trunc(str, maxLen = 60) {
  if (!str) return '-'
  str = String(str).replace(/[^\x00-\x7F]/g, c => {
    const map = { 'á':'a','é':'e','í':'i','ó':'o','ú':'u','ñ':'n','Á':'A','É':'E','Í':'I','Ó':'O','Ú':'U','Ñ':'N','ü':'u','Ü':'U' }
    return map[c] || '?'
  })
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str
}

function ascii(str) {
  if (!str) return '-'
  return String(str).replace(/[^\x00-\x7F]/g, c => {
    const map = { 'á':'a','é':'e','í':'i','ó':'o','ú':'u','ñ':'n','Á':'A','É':'E','Í':'I','Ó':'O','Ú':'U','Ñ':'N','ü':'u','Ü':'U','Δ':'D','²':'2','₂':'2','°':'o' }
    return map[c] || ''
  })
}

function ndviClass(v) {
  if (!v && v !== 0) return '-'
  if (v >= 0.5) return 'Vegetacion densa'
  if (v >= 0.3) return 'Vegetacion moderada'
  if (v >= 0.1) return 'Vegetacion escasa'
  return 'Sin vegetacion'
}

function ndviTrend(series) {
  if (!series || series.length < 2) return '-'
  const last3  = series.slice(-3).map(r => r.ndvi_mean)
  const first3 = series.slice(0,3).map(r => r.ndvi_mean)
  const delta  = last3.reduce((s,v)=>s+v,0)/last3.length - first3.reduce((s,v)=>s+v,0)/first3.length
  if (delta >  0.05) return 'En aumento'
  if (delta < -0.05) return 'En descenso'
  return 'Estable'
}

// ── Capturar mapa satelital desde el DOM ──────────────────────
async function captureSatelliteMap() {
  try {
    // Buscar el canvas del mapa satelital en el certificado
    const canvases = document.querySelectorAll('canvas')
    for (const canvas of canvases) {
      if (canvas.width > 200 && canvas.height > 100) {
        return canvas.toDataURL('image/jpeg', 0.85)
      }
    }
  } catch(e) { console.warn('No se pudo capturar el mapa:', e) }
  return null
}

// ── Dibujar mini mapa NDVI coloreado ─────────────────────────
function drawNDVIColorMap(pdf, x, y, w, h, ndviValue, label) {
  // Fondo oscuro
  pdf.setFillColor(20, 40, 20)
  pdf.roundedRect(x, y, w, h, 2, 2, 'F')

  // Gradiente simulado con barras de color según clase NDVI
  const colors = [
    [200, 50, 50],    // Rojo — sin vegetación
    [220, 180, 50],   // Amarillo — escasa
    [100, 180, 80],   // Verde claro — moderada
    [30, 120, 50],    // Verde — densa
  ]
  const barW = (w - 6) / colors.length
  colors.forEach((col, i) => {
    pdf.setFillColor(...col)
    const alpha = i / (colors.length - 1)
    const highlight = Math.abs(alpha - ndviValue / 0.8) < 0.15
    const bh = highlight ? h - 8 : h - 14
    const by = y + (h - bh) / 2
    pdf.roundedRect(x + 3 + i * barW, by, barW - 1, bh, 1, 1, 'F')
  })

  // Indicador del valor actual
  const indicatorX = x + 3 + (ndviValue / 0.8) * (w - 6)
  pdf.setFillColor(255, 255, 255)
  pdf.triangle(indicatorX - 2, y + h - 4, indicatorX + 2, y + h - 4, indicatorX, y + h - 1, 'F')

  // Label
  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'bold')
  pdf.text(label, x + w/2, y + 6, { align: 'center' })

  pdf.setFontSize(10)
  pdf.text(ndviValue?.toFixed(3) || '-', x + w/2, y + h/2 + 2, { align: 'center' })

  pdf.setFontSize(6)
  pdf.setFont('helvetica', 'normal')
  pdf.text(ndviClass(ndviValue), x + w/2, y + h - 6, { align: 'center' })
}

// ── Dibujar gráfico NDVI ──────────────────────────────────────
function drawNDVIChart(pdf, x, y, w, h, series, plantingDate) {
  if (!series || series.length === 0) return

  const maxNDVI  = 0.8
  const padLeft  = 8, padRight = 4, padTop = 4, padBottom = 12
  const chartW   = w - padLeft - padRight
  const chartH   = h - padTop - padBottom

  // Fondo
  pdf.setFillColor(248, 250, 248)
  pdf.rect(x, y, w, h, 'F')
  pdf.setDrawColor(220, 230, 220)
  pdf.rect(x, y, w, h)

  // Líneas de referencia horizontales
  [0.2, 0.3, 0.5, 0.7].forEach(ref => {
    const ry = y + padTop + chartH - (ref / maxNDVI) * chartH
    pdf.setDrawColor(ref === 0.3 ? 186 : ref === 0.5 ? 29 : 200, ref === 0.3 ? 117 : ref === 0.5 ? 158 : 200, ref === 0.3 ? 23 : ref === 0.5 ? 117 : 200)
    pdf.setLineDashPattern(ref === 0.3 || ref === 0.5 ? [1.5, 1] : [0.5, 1], 0)
    pdf.line(x + padLeft, ry, x + padLeft + chartW, ry)
    pdf.setLineDashPattern([], 0)
    pdf.setTextColor(150, 150, 150)
    pdf.setFontSize(5)
    pdf.text(ref.toFixed(1), x + padLeft - 1, ry + 1.5, { align: 'right' })
  })

  // Línea vertical de plantación
  if (plantingDate && series.length > 0) {
    const plantMonth = plantingDate.slice(0, 7)
    const idx = series.findIndex(r => r.date >= plantMonth)
    if (idx >= 0) {
      const lx = x + padLeft + (idx / (series.length - 1)) * chartW
      pdf.setDrawColor(226, 75, 74)
      pdf.setLineDashPattern([1.5, 1], 0)
      pdf.line(lx, y + padTop, lx, y + padTop + chartH)
      pdf.setLineDashPattern([], 0)
      pdf.setTextColor(226, 75, 74)
      pdf.setFontSize(5)
      pdf.text('Plantacion', lx + 1, y + padTop + 5)
    }
  }

  // Área rellena bajo la curva
  if (series.length > 1) {
    const pts = series.map((r, i) => ({
      x: x + padLeft + (i / (series.length - 1)) * chartW,
      y: y + padTop + chartH - (Math.min(r.ndvi_mean, maxNDVI) / maxNDVI) * chartH
    }))

    // Área
    pdf.setFillColor(29, 158, 117)
    pdf.saveGraphicsState()
    const areaPath = `${pts.map((p,i) => `${i===0?'m':'l'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')} l${pts[pts.length-1].x.toFixed(1)} ${(y+padTop+chartH).toFixed(1)} l${pts[0].x.toFixed(1)} ${(y+padTop+chartH).toFixed(1)} Z`

    // Línea de la curva
    pts.forEach((p, i) => {
      if (i === 0) return
      const prev = pts[i-1]
      pdf.setDrawColor(29, 158, 117)
      pdf.setLineWidth(0.8)
      pdf.line(prev.x, prev.y, p.x, p.y)
    })

    // Puntos
    pts.forEach(p => {
      pdf.setFillColor(29, 158, 117)
      pdf.circle(p.x, p.y, 0.8, 'F')
    })
  }

  // Etiquetas eje X (primera y última fecha)
  pdf.setTextColor(120, 120, 120)
  pdf.setFontSize(5)
  if (series[0])               pdf.text(series[0].date?.slice(0,7)||'',               x + padLeft,          y + h - 2)
  if (series[series.length-1]) pdf.text(series[series.length-1].date?.slice(0,7)||'', x + padLeft + chartW, y + h - 2, { align: 'right' })

  // Leyenda
  pdf.setFontSize(5)
  pdf.setTextColor(186, 117, 23)
  pdf.text('-- 0.30 Umbral restauracion', x + padLeft + chartW/2 - 20, y + h - 2)
}

// ── Generador principal ───────────────────────────────────────
export async function generateCertificatePDF({ project, report, series, sponsor }) {
  const pdf    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W      = 210, H = 297
  const margin = 14
  let y        = margin

  const GREEN      = [29, 158, 117]
  const DARK       = [13, 61, 46]
  const LIGHT_GREEN = [234, 243, 222]
  const GRAY       = [100, 100, 100]
  const LIGHT_GRAY = [248, 248, 246]
  const WHITE      = [255, 255, 255]

  const latestNdvi   = series?.[series.length-1]?.ndvi_mean || 0
  const baselineNdvi = report?.baseline_ndvi || 0
  const deltaNdvi    = report?.delta_ndvi    || 0
  const treesPerHa   = project.trees_planted && project.area_ha
    ? (project.trees_planted / project.area_ha).toFixed(0)
    : '-'

  // ── HEADER ────────────────────────────────────────────────────
  pdf.setFillColor(...DARK)
  pdf.rect(0, 0, W, 24, 'F')
  pdf.setTextColor(...WHITE)
  pdf.setFontSize(15); pdf.setFont('helvetica', 'bold')
  pdf.text('ForestVerify', margin, 10)
  pdf.setFontSize(8); pdf.setFont('helvetica', 'normal')
  pdf.text('Plataforma de Verificacion Satelital de Restauracion Forestal', margin, 17)
  pdf.text(`Generado: ${new Date().toLocaleDateString('es-AR')}`, W - margin, 17, { align: 'right' })
  y = 30

  // ── TÍTULO ────────────────────────────────────────────────────
  pdf.setFillColor(...LIGHT_GREEN)
  pdf.roundedRect(margin, y, W - margin*2, 18, 2, 2, 'F')
  pdf.setTextColor(...GRAY); pdf.setFontSize(7); pdf.setFont('helvetica', 'normal')
  pdf.text('CERTIFICADO DE VERIFICACION SATELITAL', margin + 4, y + 6)
  pdf.setTextColor(...DARK); pdf.setFontSize(13); pdf.setFont('helvetica', 'bold')
  pdf.text(trunc(ascii(project.name), 55), margin + 4, y + 14)
  y += 22

  // ── ESTADO + UBICACIÓN ────────────────────────────────────────
  const stColor = { Exitoso:[29,158,117], 'En desarrollo':[186,117,23], 'En riesgo':[216,90,48], Fallido:[226,75,74] }[report?.status] || GRAY
  pdf.setFillColor(...stColor)
  pdf.roundedRect(margin, y, 38, 8, 2, 2, 'F')
  pdf.setTextColor(...WHITE); pdf.setFontSize(8); pdf.setFont('helvetica', 'bold')
  pdf.text(ascii(report?.status || '-'), margin + 19, y + 5.5, { align: 'center' })
  pdf.setTextColor(...GRAY); pdf.setFontSize(8); pdf.setFont('helvetica', 'normal')
  pdf.text(`${trunc(ascii(project.location_name||''),35)}  |  Plantacion: ${project.planting_date?.slice(0,10)||'-'}`, margin + 44, y + 5.5)
  y += 13

  // ── IMAGEN SATELITAL ──────────────────────────────────────────
  const mapImg = await captureSatelliteMap()
  const mapH   = 48
  if (mapImg) {
    pdf.addImage(mapImg, 'JPEG', margin, y, W - margin*2, mapH)
    pdf.setDrawColor(...GREEN); pdf.setLineWidth(0.3)
    pdf.rect(margin, y, W - margin*2, mapH)
    pdf.setTextColor(...WHITE); pdf.setFontSize(6); pdf.setFont('helvetica', 'normal')
    pdf.setFillColor(0,0,0)
    pdf.roundedRect(margin+1, y+1, 52, 5, 1, 1, 'F')
    pdf.setTextColor(...WHITE)
    pdf.text('Imagen satelital ESRI + poligono del area', margin+3, y+4.5)
  } else {
    pdf.setFillColor(20, 40, 20)
    pdf.roundedRect(margin, y, W - margin*2, mapH, 2, 2, 'F')
    pdf.setTextColor(100,150,100); pdf.setFontSize(9)
    pdf.text('[ Imagen satelital no disponible ]', W/2, y + mapH/2, { align: 'center' })
  }
  y += mapH + 5

  // ── VISUALIZACIONES NDVI (baseline + actual) ──────────────────
  const ndviW = (W - margin*2 - 6) / 2
  pdf.setTextColor(...DARK); pdf.setFontSize(8); pdf.setFont('helvetica', 'bold')
  pdf.text('Indice de Vegetacion (NDVI)', margin, y + 4)
  y += 7

  drawNDVIColorMap(pdf, margin,          y, ndviW, 24, baselineNdvi, 'NDVI Baseline (pre-plantacion)')
  drawNDVIColorMap(pdf, margin+ndviW+6,  y, ndviW, 24, latestNdvi,   'NDVI Actual')
  y += 28

  // ── GRÁFICO EVOLUCIÓN NDVI ────────────────────────────────────
  pdf.setTextColor(...DARK); pdf.setFontSize(8); pdf.setFont('helvetica', 'bold')
  pdf.text('Evolucion NDVI Estival (Sentinel-2)', margin, y + 4)
  y += 6

  drawNDVIChart(pdf, margin, y, W - margin*2, 34, series, project.planting_date)
  y += 38

  // ── MÉTRICAS ──────────────────────────────────────────────────
  const metrics = [
    ['NDVI Baseline (pre-plantacion)', baselineNdvi.toFixed(3)],
    ['NDVI Actual',                    latestNdvi.toFixed(3)],
    ['Cambio NDVI',                   `${deltaNdvi >= 0 ? '+' : ''}${deltaNdvi.toFixed(3)}`],
    ['Clasificacion actual',           ndviClass(latestNdvi)],
    ['Ganancia cobertura verde',      `+${report?.green_cover_gain_pct?.toFixed(1)||'0'}%`],
    ['Tendencia',                      ndviTrend(series)],
    ['CO2 estimado capturado',        `${report ? (report.estimated_co2_kg/1000).toFixed(1) : '-'} t`],
    ['Area verificada',               `${project.area_ha||'-'} ha`],
    ['Arboles plantados',             `${project.trees_planted||'-'}`],
    ['Densidad de plantacion',        `${treesPerHa} arb/ha`],
    ['Imagenes Sentinel-2 analizadas',`${series?.length||'-'} imagenes`],
    ['Fecha del reporte',              report?.report_date||'-'],
  ]

  const colW = (W - margin*2 - 4) / 2
  metrics.forEach(([label, value], i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const x   = margin + col * (colW + 4)
    const yy  = y + row * 13

    pdf.setFillColor(...LIGHT_GRAY)
    pdf.roundedRect(x, yy, colW, 11, 1.5, 1.5, 'F')
    pdf.setTextColor(...GRAY); pdf.setFontSize(5.5); pdf.setFont('helvetica', 'normal')
    pdf.text(label.toUpperCase(), x + 3, yy + 4.5)
    pdf.setTextColor(...DARK); pdf.setFontSize(8); pdf.setFont('helvetica', 'bold')
    pdf.text(trunc(ascii(String(value)), 28), x + 3, yy + 9)
  })

  y += Math.ceil(metrics.length / 2) * 13 + 4

  // ── SPONSOR ───────────────────────────────────────────────────
  if (sponsor) {
    pdf.setFillColor(...GREEN)
    pdf.roundedRect(margin, y, W - margin*2, 9, 2, 2, 'F')
    pdf.setTextColor(...WHITE); pdf.setFontSize(7.5); pdf.setFont('helvetica', 'bold')
    pdf.text(`Sponsor: ${trunc(ascii(sponsor.sponsor_name),28)}  |  ${sponsor.trees_sponsored} arboles  |  Tier: ${sponsor.tier}`, W/2, y+6, { align:'center' })
    y += 13
  }

  // ── NOTA METODOLÓGICA ─────────────────────────────────────────
  pdf.setFillColor(255, 248, 225)
  pdf.roundedRect(margin, y, W - margin*2, 12, 2, 2, 'F')
  pdf.setTextColor(133, 100, 4); pdf.setFontSize(6); pdf.setFont('helvetica', 'normal')
  const nota = 'NOTA: El monitoreo satelital con Sentinel-2 (10m/px) verifica cambios en cobertura vegetal del area. Las estimaciones de CO2 se basan en la relacion empirica AGB-NDVI y son orientativas. No permite conteo individual de arboles.'
  const notaLines = pdf.splitTextToSize(nota, W - margin*2 - 8)
  pdf.text(notaLines, margin + 4, y + 5)
  y += 16

  // ── METODOLOGÍA ───────────────────────────────────────────────
  pdf.setFillColor(...LIGHT_GRAY)
  pdf.roundedRect(margin, y, W - margin*2, 18, 2, 2, 'F')
  pdf.setTextColor(...DARK); pdf.setFontSize(7); pdf.setFont('helvetica', 'bold')
  pdf.text('Metodologia', margin + 4, y + 6)
  pdf.setTextColor(...GRAY); pdf.setFontSize(6); pdf.setFont('helvetica', 'normal')
  const metod = ascii(report?.methodology || 'NDVI derivado de Sentinel-2 L2A (ESA Copernicus, 10m/px). Metodologia: mediana estival interanual (enero-febrero). Baseline: promedio de imagenes pre-plantacion con menos del 20% nubosidad.')
  const metodLines = pdf.splitTextToSize(metod, W - margin*2 - 8)
  pdf.text(metodLines.slice(0,3), margin + 4, y + 12)
  y += 22

  // ── HASH ──────────────────────────────────────────────────────
  pdf.setFillColor(...DARK)
  pdf.roundedRect(margin, y, W - margin*2, 14, 2, 2, 'F')
  pdf.setTextColor(...WHITE); pdf.setFontSize(6.5); pdf.setFont('helvetica', 'bold')
  pdf.text('HASH DE VERIFICACION SHA-256', margin + 4, y + 6)
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5)
  pdf.text(trunc(report?.report_hash||'-', 64), margin + 4, y + 11)

  // ── FOOTER ────────────────────────────────────────────────────
  pdf.setDrawColor(...GREEN); pdf.setLineWidth(0.4)
  pdf.line(margin, H - 10, W - margin, H - 10)
  pdf.setTextColor(...GRAY); pdf.setFontSize(6.5); pdf.setFont('helvetica', 'normal')
  pdf.text('ForestVerify  |  rewild-track.vercel.app  |  Datos: ESA Copernicus Sentinel-2 L2A', W/2, H-5, { align:'center' })

  // ── GUARDAR ───────────────────────────────────────────────────
  const filename = `ForestVerify_${ascii(project.name||'certificado').replace(/[^a-zA-Z0-9]/g,'_')}_${report?.report_date||'reporte'}.pdf`
  pdf.save(filename)
}