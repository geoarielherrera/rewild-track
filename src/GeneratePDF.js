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

// ── Capturar mapa satelital sin bloquear en caso de error ────
async function captureSatelliteMap() {
  try {
    const canvases = document.querySelectorAll('canvas')
    for (const canvas of canvases) {
      if (canvas.width > 200 && canvas.height > 100) {
        return canvas.toDataURL('image/jpeg', 0.85)
      }
    }
  } catch (e) {
    console.warn('Mapa no capturable (posible restricción CORS):', e)
  }
  return null
}

// ── Dibujar mini mapa NDVI ────────────────────────────────────
function drawNDVIColorMap(pdf, x, y, w, h, ndviValue, label) {
  pdf.setFillColor(20, 40, 20)
  pdf.roundedRect(x, y, w, h, 1.5, 1.5, 'F')

  const colors = [
    [200, 50, 50],
    [220, 180, 50],
    [100, 180, 80],
    [30, 120, 50],
  ]
  const barW = (w - 6) / colors.length
  colors.forEach((col, i) => {
    pdf.setFillColor(...col)
    const alpha = i / (colors.length - 1)
    const highlight = Math.abs(alpha - (ndviValue || 0) / 0.8) < 0.15
    const bh = highlight ? h - 6 : h - 11
    const by = y + (h - bh) / 2
    pdf.roundedRect(x + 3 + i * barW, by, barW - 1, bh, 0.8, 0.8, 'F')
  })

  const indicatorX = x + 3 + Math.min(Math.max((ndviValue || 0) / 0.8, 0), 1) * (w - 6)
  pdf.setFillColor(255, 255, 255)
  pdf.triangle(indicatorX - 1.5, y + h - 3, indicatorX + 1.5, y + h - 3, indicatorX, y + h - 0.8, 'F')

  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(6.5)
  pdf.setFont('helvetica', 'bold')
  pdf.text(label, x + w/2, y + 4.5, { align: 'center' })

  pdf.setFontSize(8.5)
  pdf.text(ndviValue ? ndviValue.toFixed(3) : '-', x + w/2, y + h/2 + 1, { align: 'center' })

  pdf.setFontSize(5.5)
  pdf.setFont('helvetica', 'normal')
  pdf.text(ndviClass(ndviValue), x + w/2, y + h - 4.5, { align: 'center' })
}

// ── Dibujar gráfico NDVI ──────────────────────────────────────
function drawNDVIChart(pdf, x, y, w, h, series, plantingDate) {
  if (!series || !Array.isArray(series) || series.length === 0) return

  const validSeries = series.filter(r => r && typeof r.ndvi_mean === 'number')
  if (validSeries.length === 0) return

  const maxNDVI   = 0.8
  const padLeft   = 8, padRight = 4, padTop = 4, padBottom = 12
  const chartW    = w - padLeft - padRight
  const chartH    = h - padTop - padBottom

  // Fondo
  pdf.setFillColor(248, 250, 248)
  pdf.rect(x, y, w, h, 'F')
  pdf.setDrawColor(220, 230, 220)
  pdf.rect(x, y, w, h)

  // Líneas de referencia
  const refs = [0.2, 0.3, 0.5, 0.7]
  refs.forEach(ref => {
    const ry = y + padTop + chartH - (ref / maxNDVI) * chartH
    if (ref === 0.3) pdf.setDrawColor(186, 117, 23)
    else if (ref === 0.5) pdf.setDrawColor(29, 158, 117)
    else pdf.setDrawColor(200, 200, 200)
    pdf.setLineDashPattern([1.5, 1], 0)
    pdf.line(x + padLeft, ry, x + padLeft + chartW, ry)
    pdf.setLineDashPattern([], 0)
    pdf.setTextColor(150, 150, 150)
    pdf.setFontSize(5)
    pdf.text(ref.toFixed(1), x + padLeft - 1, ry + 1.5, { align: 'right' })
  })

  // Línea vertical plantación
  if (plantingDate) {
    const plantMonth = plantingDate.slice(0, 7)
    const idx = validSeries.findIndex(r => r.date >= plantMonth)
    if (idx >= 0 && validSeries.length > 1) {
      const lx = x + padLeft + (idx / (validSeries.length - 1)) * chartW
      pdf.setDrawColor(226, 75, 74)
      pdf.setLineDashPattern([1.5, 1], 0)
      pdf.line(lx, y + padTop, lx, y + padTop + chartH)
      pdf.setLineDashPattern([], 0)
      pdf.setTextColor(226, 75, 74)
      pdf.setFontSize(5)
      pdf.text('Plantacion', lx + 1, y + padTop + 5)
    }
  }

  // Curva NDVI
  if (validSeries.length > 1) {
    const pts = validSeries.map((r, i) => ({
      x: x + padLeft + (i / (validSeries.length - 1)) * chartW,
      y: y + padTop + chartH - (Math.min(r.ndvi_mean, maxNDVI) / maxNDVI) * chartH
    }))

    pdf.setDrawColor(29, 158, 117)
    pdf.setLineWidth(0.8)
    for (let i = 1; i < pts.length; i++) {
      pdf.line(pts[i-1].x, pts[i-1].y, pts[i].x, pts[i].y)
    }

    // Puntos
    pts.forEach(p => {
      pdf.setFillColor(29, 158, 117)
      pdf.circle(p.x, p.y, 0.8, 'F')
    })
  }

  // Etiquetas eje X
  pdf.setTextColor(120, 120, 120)
  pdf.setFontSize(5)
  if (validSeries[0])                    pdf.text(validSeries[0].date?.slice(0,7)||'',                    x + padLeft,          y + h - 2)
  if (validSeries[validSeries.length-1]) pdf.text(validSeries[validSeries.length-1].date?.slice(0,7)||'', x + padLeft + chartW, y + h - 2, { align:'right' })
}

// ── Generador principal ───────────────────────────────────────
export async function generateCertificatePDF({ project = {}, report = {}, series = [], sponsor = null }) {
  const pdf    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W      = 210, H = 297
  const margin = 12
  let y        = margin

  const GREEN       = [29, 158, 117]
  const DARK        = [13, 61, 46]
  const LIGHT_GREEN = [234, 243, 222]
  const GRAY        = [100, 100, 100]
  const LIGHT_GRAY  = [248, 248, 246]
  const WHITE       = [255, 255, 255]

  const latestNdvi   = series?.[series.length-1]?.ndvi_mean || 0
  const baselineNdvi = report?.baseline_ndvi || 0
  const deltaNdvi    = report?.delta_ndvi    || 0
  const treesPerHa   = project.trees_planted && project.area_ha
    ? (project.trees_planted / project.area_ha).toFixed(0)
    : '-'

  // ── HEADER (18mm) ─────────────────────────────────────────────
  pdf.setFillColor(...DARK)
  pdf.rect(0, 0, W, 18, 'F')
  pdf.setTextColor(...WHITE)
  pdf.setFontSize(13); pdf.setFont('helvetica', 'bold')
  pdf.text('ForestVerify', margin, 8)
  pdf.setFontSize(7); pdf.setFont('helvetica', 'normal')
  pdf.text('Plataforma de Verificacion Satelital de Restauracion Forestal', margin, 13)
  pdf.text(`Generado: ${new Date().toLocaleDateString('es-AR')}`, W - margin, 13, { align: 'right' })
  y = 22

  // ── TÍTULO (14mm) ─────────────────────────────────────────────
  pdf.setFillColor(...LIGHT_GREEN)
  pdf.roundedRect(margin, y, W - margin*2, 14, 1.5, 1.5, 'F')
  pdf.setTextColor(...GRAY); pdf.setFontSize(6); pdf.setFont('helvetica', 'normal')
  pdf.text('CERTIFICADO DE VERIFICACION SATELITAL', margin + 3, y + 4.5)
  pdf.setTextColor(...DARK); pdf.setFontSize(11); pdf.setFont('helvetica', 'bold')
  pdf.text(trunc(ascii(project.name), 55), margin + 3, y + 10.5)
  y += 17

  // ── ESTADO + UBICACIÓN (7mm) ──────────────────────────────────
  const stColor = { Exitoso:[29,158,117], 'En desarrollo':[186,117,23], 'En riesgo':[216,90,48], Fallido:[226,75,74] }[report?.status] || GRAY
  pdf.setFillColor(...stColor)
  pdf.roundedRect(margin, y, 32, 6.5, 1.5, 1.5, 'F')
  pdf.setTextColor(...WHITE); pdf.setFontSize(7); pdf.setFont('helvetica', 'bold')
  pdf.text(ascii(report?.status || '-'), margin + 16, y + 4.5, { align: 'center' })
  pdf.setTextColor(...GRAY); pdf.setFontSize(7); pdf.setFont('helvetica', 'normal')
  pdf.text(`${trunc(ascii(project.location_name||''),35)}  |  Plantacion: ${project.planting_date?.slice(0,10)||'-'}`, margin + 36, y + 4.5)
  y += 10

  // ── IMAGEN SATELITAL (38mm) ───────────────────────────────────
  const mapImg = await captureSatelliteMap()
  const mapH   = 38
  if (mapImg) {
    pdf.addImage(mapImg, 'JPEG', margin, y, W - margin*2, mapH)
    pdf.setDrawColor(...GREEN); pdf.setLineWidth(0.3)
    pdf.rect(margin, y, W - margin*2, mapH)
    pdf.setFillColor(0,0,0)
    pdf.roundedRect(margin+1, y+1, 48, 4.5, 1, 1, 'F')
    pdf.setTextColor(...WHITE); pdf.setFontSize(5.5); pdf.setFont('helvetica', 'normal')
    pdf.text('Imagen satelital ESRI + poligono del area', margin+2.5, y+3.8)
  } else {
    pdf.setFillColor(20, 40, 20)
    pdf.roundedRect(margin, y, W - margin*2, mapH, 1.5, 1.5, 'F')
    pdf.setTextColor(100,150,100); pdf.setFontSize(8)
    pdf.text('[ Imagen satelital no disponible ]', W/2, y + mapH/2, { align: 'center' })
  }
  y += mapH + 4

  // ── VISUALIZACIONES NDVI (20mm) ───────────────────────────────
  const ndviW = (W - margin*2 - 4) / 2
  pdf.setTextColor(...DARK); pdf.setFontSize(7.5); pdf.setFont('helvetica', 'bold')
  pdf.text('Indice de Vegetacion (NDVI)', margin, y + 3)
  y += 5.5

  drawNDVIColorMap(pdf, margin,           y, ndviW, 19, baselineNdvi, 'NDVI Baseline (pre-plantacion)')
  drawNDVIColorMap(pdf, margin+ndviW+4,  y, ndviW, 19, latestNdvi,   'NDVI Actual')
  y += 22.5

  // ── GRÁFICO EVOLUCIÓN NDVI (26mm) ─────────────────────────────
  pdf.setTextColor(...DARK); pdf.setFontSize(7.5); pdf.setFont('helvetica', 'bold')
  pdf.text('Evolucion NDVI Estival (Sentinel-2)', margin, y + 3)
  y += 5.5

  drawNDVIChart(pdf, margin, y, W - margin*2, 34, series || [], project.planting_date)

  // ── MÉTRICAS (12 ítems = 6 filas de 9.5mm = 57mm) ────────────
  const metrics = [
    ['NDVI Baseline', baselineNdvi.toFixed(3)],
    ['NDVI Actual',          latestNdvi.toFixed(3)],
    ['Cambio NDVI',          `${deltaNdvi >= 0 ? '+' : ''}${deltaNdvi.toFixed(3)}`],
    ['Clasificacion',        ndviClass(latestNdvi)],
    ['Ganancia cobertura',   `+${report?.green_cover_gain_pct?.toFixed(1)||'0'}%`],
    ['Tendencia',            ndviTrend(series)],
    ['CO2 estimado',         `${report ? (report.estimated_co2_kg/1000).toFixed(1) : '-'} t`],
    ['Area verificada',      `${project.area_ha||'-'} ha`],
    ['Arboles plantados',    `${project.trees_planted||'-'}`],
    ['Densidad plantacion',  `${treesPerHa} arb/ha`],
    ['Imagenes Sentinel-2',  `${series?.length||'-'} procesadas`],
    ['Fecha del reporte',    report?.report_date||'-'],
  ]

  const colW = (W - margin*2 - 3) / 2
  metrics.forEach(([label, value], i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const x   = margin + col * (colW + 3)
    const yy  = y + row * 9.5

    pdf.setFillColor(...LIGHT_GRAY)
    pdf.roundedRect(x, yy, colW, 8.5, 1, 1, 'F')
    pdf.setTextColor(...GRAY); pdf.setFontSize(5); pdf.setFont('helvetica', 'normal')
    pdf.text(label.toUpperCase(), x + 2.5, yy + 3.2)
    pdf.setTextColor(...DARK); pdf.setFontSize(7.5); pdf.setFont('helvetica', 'bold')
    pdf.text(trunc(ascii(String(value)), 28), x + 2.5, yy + 7)
  })

  y += Math.ceil(metrics.length / 2) * 9.5 + 2

  // ── SPONSOR (si existe, 7mm) ──────────────────────────────────
  if (sponsor) {
    pdf.setFillColor(...GREEN)
    pdf.roundedRect(margin, y, W - margin*2, 7, 1.5, 1.5, 'F')
    pdf.setTextColor(...WHITE); pdf.setFontSize(7); pdf.setFont('helvetica', 'bold')
    pdf.text(`Sponsor: ${trunc(ascii(sponsor.sponsor_name),28)}  |  ${sponsor.trees_sponsored} arboles  |  Tier: ${sponsor.tier}`, W/2, y+4.8, { align:'center' })
    y += 9.5
  }

  // ── NOTA + METODOLOGÍA + HASH (Compacto) ─────────────────────
  pdf.setFillColor(255, 248, 225)
  pdf.roundedRect(margin, y, W - margin*2, 8, 1, 1, 'F')
  pdf.setTextColor(133, 100, 4); pdf.setFontSize(5.2); pdf.setFont('helvetica', 'normal')
  const nota = 'NOTA: Monitoreo satelital Sentinel-2 (10m/px) verifica cambios en cobertura vegetal. CO2 estimado por relacion empirica AGB-NDVI. No permite conteo individual de arboles.'
  pdf.text(pdf.splitTextToSize(nota, W - margin*2 - 6), margin + 3, y + 3.5)
  y += 10.5

  pdf.setFillColor(...DARK)
  pdf.roundedRect(margin, y, W - margin*2, 10, 1, 1, 'F')
  pdf.setTextColor(...WHITE); pdf.setFontSize(5.5); pdf.setFont('helvetica', 'bold')
  pdf.text('HASH DE VERIFICACION SHA-256', margin + 3, y + 4)
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5.5)
  pdf.text(trunc(report?.report_hash||'-', 68), margin + 3, y + 8)

  // ── FOOTER ────────────────────────────────────────────────────
  pdf.setDrawColor(...GREEN); pdf.setLineWidth(0.3)
  pdf.line(margin, H - 7, W - margin, H - 7)
  pdf.setTextColor(...GRAY); pdf.setFontSize(6); pdf.setFont('helvetica', 'normal')
  pdf.text('ForestVerify  |  rewild-track.vercel.app  |  Datos: ESA Copernicus Sentinel-2 L2A', W/2, H-3.5, { align:'center' })

  // ── GUARDAR ───────────────────────────────────────────────────
  const filename = `ForestVerify_${ascii(project.name||'certificado').replace(/[^a-zA-Z0-9]/g,'_')}_${report?.report_date||'reporte'}.pdf`
  pdf.save(filename)
}