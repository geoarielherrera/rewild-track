import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

export async function generateCertificatePDF({ project, report, series, sponsor }) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210, H = 297
  const margin = 16
  let y = margin

  // ── Colores ──────────────────────────────────────────────────
  const GREEN      = [29, 158, 117]
  const DARK       = [13, 61, 46]
  const LIGHT_GREEN = [234, 243, 222]
  const GRAY       = [100, 100, 100]
  const LIGHT_GRAY = [245, 245, 242]

  // ── Header verde ─────────────────────────────────────────────
  pdf.setFillColor(...DARK)
  pdf.rect(0, 0, W, 28, 'F')

  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(16)
  pdf.setFont('helvetica', 'bold')
  pdf.text('ForestVerify', margin, 12)

  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  pdf.text('Plataforma de Verificación Satelital de Restauración Forestal', margin, 19)

  pdf.setFontSize(8)
  pdf.text(`Generado: ${new Date().toLocaleDateString('es-AR')}`, W - margin, 19, { align: 'right' })

  y = 36

  // ── Título del certificado ────────────────────────────────────
  pdf.setFillColor(...LIGHT_GREEN)
  pdf.roundedRect(margin, y, W - margin*2, 22, 3, 3, 'F')

  pdf.setTextColor(...DARK)
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'normal')
  pdf.text('CERTIFICADO DE VERIFICACIÓN SATELITAL', margin + 6, y + 7)

  pdf.setFontSize(14)
  pdf.setFont('helvetica', 'bold')
  pdf.text(project.name || 'Proyecto de Restauración', margin + 6, y + 16)

  y += 28

  // ── Estado ───────────────────────────────────────────────────
  const statusColor = {
    Exitoso:         [29, 158, 117],
    'En desarrollo': [186, 117, 23],
    'En riesgo':     [216, 90, 48],
    Fallido:         [226, 75, 74],
  }[report?.status] || GRAY

  pdf.setFillColor(...statusColor)
  pdf.roundedRect(margin, y, 50, 10, 2, 2, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'bold')
  pdf.text(report?.status || '—', margin + 25, y + 6.5, { align: 'center' })

  pdf.setTextColor(...GRAY)
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  pdf.text(`📍 ${project.location_name || ''}   ·   Fecha de plantación: ${project.planting_date || '—'}`, margin + 56, y + 6.5)

  y += 16

  // ── Métricas principales (2 columnas) ─────────────────────────
  const metrics = [
    ['NDVI Inicial (baseline)',  report?.baseline_ndvi?.toFixed(3)       || '—'],
    ['NDVI Actual',              report?.current_ndvi?.toFixed(3)         || '—'],
    ['Cambio NDVI (Δ)',          `+${report?.delta_ndvi?.toFixed(3) || '0'}`],
    ['Ganancia cobertura verde', `+${report?.green_cover_gain_pct?.toFixed(1) || '0'}%`],
    ['Árboles verificados',      `~${report?.estimated_trees_alive || '—'} de ${project.trees_planted || '—'}`],
    ['Tasa de supervivencia',    `${report?.success_rate_pct || '—'}%`],
    ['CO₂ estimado capturado',   `${report ? (report.estimated_co2_kg / 1000).toFixed(1) : '—'} toneladas`],
    ['Área verificada',          `${project.area_ha || '—'} ha`],
    ['Imágenes analizadas',      `${series?.length || '—'} imágenes Sentinel-2`],
    ['Fecha del reporte',        report?.report_date || '—'],
  ]

  const colW = (W - margin * 2 - 6) / 2
  metrics.forEach(([ label, value ], i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const x   = margin + col * (colW + 6)
    const yy  = y + row * 16

    pdf.setFillColor(...LIGHT_GRAY)
    pdf.roundedRect(x, yy, colW, 13, 2, 2, 'F')

    pdf.setTextColor(...GRAY)
    pdf.setFontSize(7)
    pdf.setFont('helvetica', 'normal')
    pdf.text(label.toUpperCase(), x + 4, yy + 5)

    pdf.setTextColor(...DARK)
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'bold')
    pdf.text(String(value), x + 4, yy + 11)
  })

  y += Math.ceil(metrics.length / 2) * 16 + 6

  // ── Sponsor ───────────────────────────────────────────────────
  if (sponsor) {
    pdf.setFillColor(...GREEN)
    pdf.roundedRect(margin, y, W - margin*2, 12, 2, 2, 'F')
    pdf.setTextColor(255, 255, 255)
    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'bold')
    pdf.text(`Sponsor: ${sponsor.sponsor_name}   ·   ${sponsor.trees_sponsored} árboles apadrinados   ·   Tier: ${sponsor.tier}`, margin + 4, y + 8)
    y += 18
  }

  // ── Serie temporal NDVI ───────────────────────────────────────
  if (series && series.length > 0) {
    pdf.setTextColor(...DARK)
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'bold')
    pdf.text('Serie temporal NDVI', margin, y + 6)
    y += 10

    // Mini gráfico de barras
    const chartW = W - margin * 2
    const chartH = 30
    const maxNDVI = 0.8
    const barW    = Math.min(8, (chartW - 4) / series.length - 1)

    pdf.setFillColor(...LIGHT_GRAY)
    pdf.rect(margin, y, chartW, chartH, 'F')

    // Línea de referencia 0.3
    const refY = y + chartH - (0.3 / maxNDVI) * chartH
    pdf.setDrawColor(186, 117, 23)
    pdf.setLineDashPattern([1, 1], 0)
    pdf.line(margin, refY, margin + chartW, refY)
    pdf.setLineDashPattern([], 0)

    series.forEach((r, i) => {
      const barH   = (r.ndvi_mean / maxNDVI) * chartH
      const bx     = margin + 2 + i * (barW + 1)
      const by     = y + chartH - barH
      const color  = r.ndvi_mean >= 0.5 ? [26, 122, 63] : r.ndvi_mean >= 0.3 ? [29, 158, 117] : [168, 200, 64]
      pdf.setFillColor(...color)
      pdf.rect(bx, by, barW, barH, 'F')
    })

    // Etiquetas primera y última fecha
    pdf.setTextColor(...GRAY)
    pdf.setFontSize(6)
    pdf.setFont('helvetica', 'normal')
    if (series[0])                  pdf.text(series[0].date?.slice(0,7) || '',              margin + 2,          y + chartH + 4)
    if (series[series.length - 1]) pdf.text(series[series.length-1].date?.slice(0,7) || '', margin + chartW - 2, y + chartH + 4, { align: 'right' })

    y += chartH + 10
  }

  // ── Metodología ───────────────────────────────────────────────
  pdf.setFillColor(...LIGHT_GRAY)
  pdf.roundedRect(margin, y, W - margin*2, 28, 2, 2, 'F')

  pdf.setTextColor(...DARK)
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Metodología', margin + 4, y + 6)

  pdf.setTextColor(...GRAY)
  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'normal')
  const metodText = report?.methodology || 'Verificación basada en NDVI derivado de imágenes Sentinel-2 L2A (ESA Copernicus, resolución 10m/px). Baseline calculado como promedio de imágenes con menos del 20% de nubosidad previas a la plantación.'
  const lines = pdf.splitTextToSize(metodText, W - margin*2 - 8)
  pdf.text(lines.slice(0, 3), margin + 4, y + 13)

  y += 34

  // ── Hash de verificación ──────────────────────────────────────
  pdf.setFillColor(13, 61, 46)
  pdf.roundedRect(margin, y, W - margin*2, 18, 2, 2, 'F')

  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'bold')
  pdf.text('HASH DE VERIFICACIÓN SHA-256', margin + 4, y + 6)

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  pdf.text(report?.report_hash || '—', margin + 4, y + 13)

  y += 24

  // ── Footer ────────────────────────────────────────────────────
  pdf.setTextColor(...GRAY)
  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'normal')
  pdf.text('ForestVerify · rewild-track.vercel.app · Datos: ESA Copernicus Sentinel-2 L2A', W/2, H - 8, { align: 'center' })
  pdf.setDrawColor(...GREEN)
  pdf.line(margin, H - 12, W - margin, H - 12)

  // ── Guardar ───────────────────────────────────────────────────
  const filename = `ForestVerify_${(project.name || 'certificado').replace(/\s+/g, '_')}_${report?.report_date || 'reporte'}.pdf`
  pdf.save(filename)
}