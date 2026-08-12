import jsPDF from 'jspdf'

export async function generateCertificatePDF({ project, report, series, sponsor }) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210, H = 297
  const margin = 16
  let y = margin

  // ── Colores ──────────────────────────────────────────────────
  const GREEN       = [29, 158, 117]
  const DARK        = [13, 61, 46]
  const LIGHT_GREEN = [234, 243, 222]
  const GRAY        = [100, 100, 100]
  const LIGHT_GRAY  = [245, 245, 242]

  // Truncar texto para evitar desbordamiento
  function trunc(str, maxLen = 60) {
    if (!str) return '-'
    return str.length > maxLen ? str.slice(0, maxLen) + '...' : str
  }

  // ── Header ────────────────────────────────────────────────────
  pdf.setFillColor(...DARK)
  pdf.rect(0, 0, W, 26, 'F')

  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(15)
  pdf.setFont('helvetica', 'bold')
  pdf.text('ForestVerify', margin, 11)

  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'normal')
  pdf.text('Plataforma de Verificacion Satelital de Restauracion Forestal', margin, 18)
  pdf.text(`Generado: ${new Date().toLocaleDateString('es-AR')}`, W - margin, 18, { align: 'right' })

  y = 34

  // ── Título ────────────────────────────────────────────────────
  pdf.setFillColor(...LIGHT_GREEN)
  pdf.roundedRect(margin, y, W - margin*2, 22, 3, 3, 'F')

  pdf.setTextColor(...GRAY)
  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'normal')
  pdf.text('CERTIFICADO DE VERIFICACION SATELITAL', margin + 5, y + 7)

  pdf.setTextColor(...DARK)
  pdf.setFontSize(13)
  pdf.setFont('helvetica', 'bold')
  pdf.text(trunc(project.name, 55), margin + 5, y + 16)

  y += 28

  // ── Estado + ubicación ────────────────────────────────────────
  const statusColor = {
    Exitoso:         [29, 158, 117],
    'En desarrollo': [186, 117, 23],
    'En riesgo':     [216, 90, 48],
    Fallido:         [226, 75, 74],
  }[report?.status] || GRAY

  pdf.setFillColor(...statusColor)
  pdf.roundedRect(margin, y, 36, 9, 2, 2, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'bold')
  pdf.text(report?.status || '-', margin + 18, y + 6, { align: 'center' })

  pdf.setTextColor(...GRAY)
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'normal')
  const locText = `${trunc(project.location_name || '', 35)}   Plantacion: ${project.planting_date?.slice(0,10) || '-'}`
  pdf.text(locText, margin + 42, y + 6)

  y += 14

  // ── Métricas en grilla ────────────────────────────────────────
  const metrics = [
    ['NDVI Inicial (baseline)',    report?.baseline_ndvi?.toFixed(3)            || '-'],
    ['NDVI Actual',                report?.current_ndvi?.toFixed(3)              || '-'],
    ['Cambio NDVI',               `+${report?.delta_ndvi?.toFixed(3) || '0'}`          ],
    ['Cobertura verde ganada',    `+${report?.green_cover_gain_pct?.toFixed(1) || '0'}%`],
    ['Arboles verificados',       `~${report?.estimated_trees_alive || '-'} de ${project.trees_planted || '-'}`],
    ['Tasa de supervivencia',     `${report?.success_rate_pct || '-'}%`               ],
    ['CO2 capturado (estimado)',  `${report ? (report.estimated_co2_kg/1000).toFixed(1) : '-'} t`],
    ['Area verificada',           `${project.area_ha || '-'} ha`                      ],
    ['Imagenes analizadas',       `${series?.length || '-'} imagenes Sentinel-2`      ],
    ['Fecha del reporte',          report?.report_date || '-'                          ],
  ]

  const colW = (W - margin*2 - 4) / 2

  metrics.forEach(([label, value], i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const x   = margin + col * (colW + 4)
    const yy  = y + row * 15

    pdf.setFillColor(...LIGHT_GRAY)
    pdf.roundedRect(x, yy, colW, 12, 2, 2, 'F')

    pdf.setTextColor(...GRAY)
    pdf.setFontSize(6)
    pdf.setFont('helvetica', 'normal')
    pdf.text(label.toUpperCase(), x + 3, yy + 5)

    pdf.setTextColor(...DARK)
    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'bold')
    pdf.text(trunc(String(value), 30), x + 3, yy + 10)
  })

  y += Math.ceil(metrics.length / 2) * 15 + 4

  // ── Sponsor ───────────────────────────────────────────────────
  if (sponsor) {
    pdf.setFillColor(...GREEN)
    pdf.roundedRect(margin, y, W - margin*2, 10, 2, 2, 'F')
    pdf.setTextColor(255, 255, 255)
    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'bold')
    const sponsorText = `Sponsor: ${trunc(sponsor.sponsor_name,30)}  |  ${sponsor.trees_sponsored} arboles  |  Tier: ${sponsor.tier}`
    pdf.text(sponsorText, W/2, y + 7, { align: 'center' })
    y += 14
  }

  // ── Gráfico NDVI ──────────────────────────────────────────────
  if (series && series.length > 0) {
    pdf.setTextColor(...DARK)
    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'bold')
    pdf.text('Serie temporal NDVI (Sentinel-2)', margin, y + 5)
    y += 8

    const chartW = W - margin*2
    const chartH = 28
    const maxNDVI = 0.8
    const barW    = Math.max(2, Math.min(7, (chartW - 4) / series.length - 1))

    // Fondo
    pdf.setFillColor(...LIGHT_GRAY)
    pdf.rect(margin, y, chartW, chartH, 'F')

    // Línea ref 0.3
    const refY = y + chartH - (0.3 / maxNDVI) * chartH
    pdf.setDrawColor(186, 117, 23)
    pdf.setLineDashPattern([1, 1], 0)
    pdf.line(margin, refY, margin + chartW, refY)
    pdf.setLineDashPattern([], 0)

    // Barras
    series.forEach((r, i) => {
      const barH = Math.max(1, (r.ndvi_mean / maxNDVI) * chartH)
      const bx   = margin + 2 + i * (barW + 1)
      const by   = y + chartH - barH
      const col  = r.ndvi_mean >= 0.5 ? [26,122,63] : r.ndvi_mean >= 0.3 ? [29,158,117] : [168,200,64]
      pdf.setFillColor(...col)
      pdf.rect(bx, by, barW, barH, 'F')
    })

    // Fechas
    pdf.setTextColor(...GRAY)
    pdf.setFontSize(6)
    pdf.setFont('helvetica', 'normal')
    if (series[0])               pdf.text(series[0].date?.slice(0,7) || '',               margin + 1,          y + chartH + 4)
    if (series[series.length-1]) pdf.text(series[series.length-1].date?.slice(0,7) || '', margin + chartW - 1, y + chartH + 4, { align: 'right' })

    // Leyenda
    pdf.setFontSize(6)
    pdf.text('-- Umbral restauracion (0.30)', margin + chartW/2, y + chartH + 4, { align: 'center' })

    y += chartH + 10
  }

  // ── Metodología ───────────────────────────────────────────────
  pdf.setFillColor(...LIGHT_GRAY)
  pdf.roundedRect(margin, y, W - margin*2, 26, 2, 2, 'F')

  pdf.setTextColor(...DARK)
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Metodologia', margin + 4, y + 7)

  pdf.setTextColor(...GRAY)
  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'normal')
  const metodText = report?.methodology
    || 'NDVI derivado de Sentinel-2 L2A (ESA Copernicus, 10m/px). Baseline: promedio de imagenes con menos del 20% de nubosidad previas a la plantacion. CO2 estimado via relacion empirica AGB-NDVI.'
  const lines = pdf.splitTextToSize(metodText.replace(/[^\x00-\x7F]/g, ' '), W - margin*2 - 8)
  pdf.text(lines.slice(0, 3), margin + 4, y + 14)

  y += 30

  // ── Hash ──────────────────────────────────────────────────────
  pdf.setFillColor(...DARK)
  pdf.roundedRect(margin, y, W - margin*2, 16, 2, 2, 'F')

  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'bold')
  pdf.text('HASH DE VERIFICACION SHA-256', margin + 4, y + 6)

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  pdf.text(trunc(report?.report_hash || '-', 64), margin + 4, y + 13)

  // ── Footer ────────────────────────────────────────────────────
  pdf.setDrawColor(...GREEN)
  pdf.line(margin, H - 12, W - margin, H - 12)
  pdf.setTextColor(...GRAY)
  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'normal')
  pdf.text('ForestVerify  |  rewild-track.vercel.app  |  Datos: ESA Copernicus Sentinel-2 L2A', W/2, H - 6, { align: 'center' })

  // ── Guardar ───────────────────────────────────────────────────
  const filename = `ForestVerify_${(project.name || 'certificado').replace(/[^a-zA-Z0-9]/g, '_')}_${report?.report_date || 'reporte'}.pdf`
  pdf.save(filename)
}