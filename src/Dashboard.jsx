import { useState, useEffect } from 'react'
import { fetchProject, fetchNDVI, fetchLatestReport, fetchSponsor } from './supabase'
import SatelliteMap from './SatelliteMap'
import { generateCertificatePDF } from './GeneratePDF'
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'

// ── Helpers ───────────────────────────────────────────────────
const ndviColor = v => v >= 0.5 ? '#1a7a3f' : v >= 0.3 ? '#1D9E75' : v >= 0.1 ? '#a8c840' : '#c8b830'
const statusColor = s => ({ Exitoso:'#1D9E75', 'En desarrollo':'#BA7517', 'En riesgo':'#D85A30', Fallido:'#E24B4A' }[s] || '#888')

function ndviClass(v) {
  if (v >= 0.5) return 'Vegetación densa'
  if (v >= 0.3) return 'Vegetación moderada'
  if (v >= 0.1) return 'Vegetación escasa'
  return 'Sin vegetación'
}

function ndviTrend(series) {
  if (!series || series.length < 2) return { label: 'Sin datos', color: '#888', icon: '—' }
  const last3  = series.slice(-3).map(r => r.ndvi_mean)
  const first3 = series.slice(0, 3).map(r => r.ndvi_mean)
  const avgLast  = last3.reduce((s,v)=>s+v,0)/last3.length
  const avgFirst = first3.reduce((s,v)=>s+v,0)/first3.length
  const delta = avgLast - avgFirst
  if (delta >  0.05) return { label: 'En aumento',  color: '#1D9E75', icon: '↑' }
  if (delta < -0.05) return { label: 'En descenso', color: '#E24B4A', icon: '↓' }
  return { label: 'Estable', color: '#BA7517', icon: '→' }
}

function Badge({ color, children }) {
  return (
    <span style={{ fontSize:11, fontWeight:500, padding:'2px 10px', borderRadius:99, background:color+'22', color, border:`1px solid ${color}44`, whiteSpace:'nowrap' }}>
      {children}
    </span>
  )
}

function StatCard({ icon, label, value, sub, color }) {
  return (
    <div style={{ background:'#fff', border:'0.5px solid #e8e8e4', borderRadius:12, padding:'14px 16px' }}>
      <div style={{ fontSize:11, color:'#888', marginBottom:4 }}>{icon} {label}</div>
      <div style={{ fontSize:22, fontWeight:700, color: color||'#1a1a1a' }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'#aaa', marginTop:2 }}>{sub}</div>}
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'#fff', border:'0.5px solid #e8e8e4', borderRadius:8, padding:'8px 12px', fontSize:12, boxShadow:'0 2px 8px rgba(0,0,0,0.1)' }}>
      <div style={{ color:'#888', marginBottom:3 }}>{label}</div>
      <div style={{ color: ndviColor(payload[0]?.value), fontWeight:600 }}>NDVI: {payload[0]?.value?.toFixed(3)}</div>
      <div style={{ color:'#888', fontSize:11 }}>{ndviClass(payload[0]?.value)}</div>
      {payload[1] && <div style={{ color:'#3aab5c' }}>Cobertura verde: {payload[1]?.value?.toFixed(1)}%</div>}
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────
export default function Dashboard({ projectId = 'PROJ-2024-001' }) {
  const [project, setProject] = useState(null)
  const [report,  setReport]  = useState(null)
  const [series,  setSeries]  = useState([])
  const [sponsor, setSponsor] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [tab,     setTab]     = useState('resumen')

  useEffect(() => {
    async function load() {
      try {
        const [proj, rep, ndvi, sp] = await Promise.all([
          fetchProject(projectId),
          fetchLatestReport(projectId),
          fetchNDVI(projectId),
          fetchSponsor(projectId),
        ])
        setProject(proj)
        setReport(rep)
        setSeries(ndvi.map(r => ({ ...r, date: r.date.slice(0,7) })))
        setSponsor(sp)
      } catch(e) { setError(e.message) }
      finally    { setLoading(false) }
    }
    load()
  }, [projectId])

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'80vh', flexDirection:'column', gap:12 }}>
      <div style={{ width:36, height:36, border:'3px solid #1D9E75', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <span style={{ fontSize:13, color:'#888' }}>Cargando datos desde Supabase…</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (error) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'80vh' }}>
      <div style={{ textAlign:'center', maxWidth:340 }}>
        <div style={{ fontSize:36, marginBottom:12 }}>⚠️</div>
        <div style={{ fontSize:14, color:'#991B1B', marginBottom:16 }}>{error}</div>
        <button onClick={()=>window.location.reload()} style={{ padding:'8px 20px', borderRadius:8, border:'0.5px solid #ddd', background:'#fff', cursor:'pointer', fontSize:13 }}>Reintentar</button>
      </div>
    </div>
  )

  const latestNdvi   = series[series.length-1]?.ndvi_mean || 0
  const baselineNdvi = report?.baseline_ndvi || 0
  const deltaNdvi    = report?.delta_ndvi    || 0
  const months       = Math.round((new Date() - new Date(project.planting_date)) / (1000*60*60*24*30))
  const trend        = ndviTrend(series)
  const plantMonth = (() => {
  if (!project?.planting_date || !series || series.length === 0) return null;
  
  const plantTime = new Date(project.planting_date).getTime();
  
  let closestDate = series[0].date;
  let minDiff = Infinity;

  series.forEach((item) => {
    if (!item?.date) return;
    const itemDateStr = item.date.length === 7 ? `${item.date}-01` : item.date;
    const itemTime = new Date(itemDateStr).getTime();
    const diff = Math.abs(itemTime - plantTime);

    if (diff < minDiff) {
      minDiff = diff;
      closestDate = item.date;
    }
  });

  return closestDate;
})();
  
  return (
    <div style={{ fontFamily:'-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif', background:'#f5f5f2', minHeight:'100vh', paddingBottom:40 }}>

      {/* Header */}
      <div style={{ background:'#fff', borderBottom:'0.5px solid #e8e8e4', padding:'14px 20px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:10 }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
              <span style={{ fontSize:20 }}>🌳</span>
              <span style={{ fontSize:16, fontWeight:600 }}>{project.name}</span>
              {report && <Badge color={statusColor(report.status)}>{report.status}</Badge>}
            </div>
            <div style={{ fontSize:12, color:'#888' }}>
              📍 {project.location_name} · {months} meses de monitoreo · {series.length} imágenes satelitales
            </div>
          </div>
          {sponsor && (
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:11, color:'#aaa' }}>Sponsor</div>
              <div style={{ fontSize:13, fontWeight:500 }}>{sponsor.sponsor_name}</div>
              <div style={{ fontSize:11, color:'#888' }}>{sponsor.trees_sponsored} árboles · Tier {sponsor.tier}</div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, padding:'10px 20px 0', background:'#fff', borderBottom:'0.5px solid #e8e8e4', overflowX:'auto' }}>
        {[['resumen','Resumen'],['serie','Serie NDVI'],['certificado','Certificado']].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{ padding:'7px 16px', borderRadius:'8px 8px 0 0', border:'0.5px solid #e8e8e4', borderBottom:tab===k?'2px solid #1D9E75':'0.5px solid #e8e8e4', background:'#fff', fontSize:13, fontWeight:tab===k?500:400, color:tab===k?'#1D9E75':'#888', cursor:'pointer', whiteSpace:'nowrap' }}>
            {l}
          </button>
        ))}
      </div>

      <div style={{ maxWidth:860, margin:'16px auto', padding:'0 16px' }}>

        {/* ── RESUMEN ── */}
        {tab === 'resumen' && (
          <div>
            {/* Mapa satelital */}
            {project.polygon && (
              <div style={{ marginBottom:14 }}>
                <SatelliteMap geojson={project.polygon} height={280} />
              </div>
            )}

            {report && (
              <>
                {/* KPIs */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:10, marginBottom:14 }}>
                  <StatCard icon="🌿" label="NDVI actual"        value={latestNdvi.toFixed(3)}                       sub={ndviClass(latestNdvi)}                           color={ndviColor(latestNdvi)} />
                  <StatCard icon="📈" label="Cambio NDVI"        value={`${deltaNdvi >= 0 ? '+' : ''}${deltaNdvi.toFixed(3)}`} sub={`Baseline: ${baselineNdvi.toFixed(3)}`} color={deltaNdvi >= 0 ? '#1D9E75' : '#E24B4A'} />
                  <StatCard icon="🟢" label="Cobertura verde"    value={`+${report.green_cover_gain_pct?.toFixed(1)}%`} sub="ganancia desde baseline"                      color="#3aab5c" />
                  <StatCard icon={trend.icon} label="Tendencia"  value={trend.label}                                 sub={`${series.length} imágenes analizadas`}           color={trend.color} />
                  <StatCard icon="💨" label="CO₂ estimado"       value={`${(report.estimated_co2_kg/1000).toFixed(1)} t`} sub="estimación por AGB-NDVI"                    color="#185FA5" />
                  <StatCard icon="🛰️" label="Clasificación"     value={ndviClass(latestNdvi)}                       sub={`Área: ${project.area_ha} ha`}                   color={ndviColor(latestNdvi)} />
                </div>

                {/* Gráfico NDVI */}
                <div style={{ background:'#fff', border:'0.5px solid #e8e8e4', borderRadius:12, padding:'16px', marginBottom:14 }}>
                  <div style={{ fontSize:13, fontWeight:500, marginBottom:2 }}>Evolución NDVI</div>
                  <div style={{ fontSize:11, color:'#888', marginBottom:14 }}>Sentinel-2 · {series.length} imágenes · {project.area_ha} ha</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={series}>
                      <defs>
                        <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#1D9E75" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#1D9E75" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" tick={{ fontSize:10 }} />
                      <YAxis domain={[0,0.8]} tick={{ fontSize:10 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <ReferenceLine y={0.3}         stroke="#BA7517" strokeDasharray="4 2" label={{ value:'0.30', fontSize:9, fill:'#BA7517' }} />
                      <ReferenceLine y={0.5}         stroke="#1D9E75" strokeDasharray="4 2" />
                      {plantMonth && <ReferenceLine x={plantMonth} stroke="#E24B4A" strokeDasharray="4 2" label={{ value:'Plantación', fontSize:9, fill:'#E24B4A', position:'insideTopLeft' }} />}
                      <Area type="monotone" dataKey="ndvi_mean" stroke="#1D9E75" fill="url(#g1)" strokeWidth={2.5} dot={{ r:3, fill:'#1D9E75' }} />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div style={{ display:'flex', gap:16, fontSize:11, color:'#888', marginTop:6, flexWrap:'wrap' }}>
                    <span>── 0.30 Umbral restauración</span>
                    <span style={{ color:'#1D9E75' }}>── 0.50 Vegetación densa</span>
                    {plantMonth && <span style={{ color:'#E24B4A' }}>│ Fecha de plantación</span>}
                  </div>
                </div>
              </>
            )}

            {!report && (
              <div style={{ background:'#fff', border:'0.5px solid #e8e8e4', borderRadius:12, padding:'32px', textAlign:'center', color:'#888', fontSize:13 }}>
                🛰️ Aún no hay datos NDVI para este proyecto.<br />El pipeline los generará automáticamente el próximo ciclo.
              </div>
            )}

            {/* Info del proyecto */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div style={{ background:'#fff', border:'0.5px solid #e8e8e4', borderRadius:12, padding:'14px 16px' }}>
                <div style={{ fontSize:12, fontWeight:500, color:'#666', marginBottom:10 }}>Proyecto</div>
                {[['Área',`${project.area_ha} ha`],['Plantación',project.planting_date],['Árboles plantados',project.trees_planted],['Imágenes Sentinel-2',series.length]].map(([l,v])=>(
                  <div key={l} style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:6 }}>
                    <span style={{ color:'#888' }}>{l}</span><span style={{ fontWeight:500 }}>{v}</span>
                  </div>
                ))}
              </div>
              {report && (
                <div style={{ background:'#fff', border:'0.5px solid #e8e8e4', borderRadius:12, padding:'14px 16px' }}>
                  <div style={{ fontSize:12, fontWeight:500, color:'#666', marginBottom:10 }}>Último reporte</div>
                  {[['Fecha',report.report_date],['NDVI baseline',baselineNdvi.toFixed(3)],['NDVI actual',latestNdvi.toFixed(3)],['Estado',report.status]].map(([l,v])=>(
                    <div key={l} style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:6 }}>
                      <span style={{ color:'#888' }}>{l}</span><span style={{ fontWeight:500 }}>{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── SERIE NDVI ── */}
        {tab === 'serie' && (
          <div>
            <div style={{ background:'#fff', border:'0.5px solid #e8e8e4', borderRadius:12, padding:'16px', marginBottom:12 }}>
              <div style={{ fontSize:13, fontWeight:500, marginBottom:14 }}>NDVI + Cobertura verde</div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={series}>
                  <XAxis dataKey="date" tick={{ fontSize:10 }} />
                  <YAxis yAxisId="ndvi" domain={[0,0.8]} tick={{ fontSize:10 }} />
                  <YAxis yAxisId="cov"  orientation="right" domain={[0,100]} tick={{ fontSize:10 }} unit="%" />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine yAxisId="ndvi" y={0.3} stroke="#BA7517" strokeDasharray="4 2" />
                  <ReferenceLine yAxisId="ndvi" y={0.5} stroke="#1D9E75" strokeDasharray="4 2" />
                  {plantMonth && <ReferenceLine yAxisId="ndvi" x={plantMonth} stroke="#E24B4A" strokeDasharray="4 2" label={{ value:'Plantación', fontSize:9, fill:'#E24B4A' }} />}
                  <Line yAxisId="ndvi" type="monotone" dataKey="ndvi_mean"       stroke="#1D9E75" strokeWidth={2.5} dot={{ r:4 }} />
                  <Line yAxisId="cov"  type="monotone" dataKey="green_cover_pct" stroke="#3aab5c" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div style={{ background:'#fff', border:'0.5px solid #e8e8e4', borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:'12px 16px', borderBottom:'0.5px solid #e8e8e4', fontSize:13, fontWeight:500 }}>
                Registros satelitales ({series.length} imágenes)
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ background:'#f9f9f7' }}>
                      {['Fecha','NDVI','Clasificación','Cobertura verde','Veg. densa','Nubes','Hash'].map(h=>(
                        <th key={h} style={{ padding:'8px 12px', textAlign:'left', color:'#888', fontWeight:500, borderBottom:'0.5px solid #e8e8e4', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...series].reverse().map((r,i)=>(
                      <tr key={i} style={{ borderBottom:'0.5px solid #f0f0ec' }}>
                        <td style={{ padding:'7px 12px', fontWeight:500 }}>{r.date}</td>
                        <td style={{ padding:'7px 12px', color:ndviColor(r.ndvi_mean), fontWeight:600 }}>{r.ndvi_mean?.toFixed(3)}</td>
                        <td style={{ padding:'7px 12px' }}>{ndviClass(r.ndvi_mean)}</td>
                        <td style={{ padding:'7px 12px' }}>{r.green_cover_pct?.toFixed(1)}%</td>
                        <td style={{ padding:'7px 12px' }}>{r.dense_veg_pct?.toFixed(1)}%</td>
                        <td style={{ padding:'7px 12px', color:'#aaa' }}>{r.cloud_cover?.toFixed(1)}%</td>
                        <td style={{ padding:'7px 12px', fontFamily:'monospace', fontSize:10, color:'#bbb' }}>{r.image_hash}…</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── CERTIFICADO ── */}
        {tab === 'certificado' && (
          <div>
            <div style={{ background:'#fff', border:'1px solid #1D9E75', borderRadius:14, padding:'24px', marginBottom:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
                <div>
                  <div style={{ fontSize:11, color:'#888', marginBottom:4 }}>CERTIFICADO DE VERIFICACIÓN SATELITAL</div>
                  <div style={{ fontSize:18, fontWeight:700 }}>{project.name}</div>
                  <div style={{ fontSize:12, color:'#888' }}>{project.location_name}</div>
                </div>
                <span style={{ fontSize:28 }}>🛰️</span>
              </div>

              {/* Mapa satelital en certificado */}
              {project.polygon && (
                <div style={{ marginBottom:16 }}>
                  <SatelliteMap geojson={project.polygon} height={220} />
                </div>
              )}

              {report ? (
                <>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
                    {[
                      ['NDVI baseline (pre-plantación)', baselineNdvi.toFixed(3)],
                      ['NDVI actual',                    latestNdvi.toFixed(3)],
                      ['Cambio NDVI (Δ)',                `${deltaNdvi >= 0 ? '+' : ''}${deltaNdvi.toFixed(3)}`],
                      ['Clasificación actual',           ndviClass(latestNdvi)],
                      ['Ganancia cobertura verde',       `+${report.green_cover_gain_pct?.toFixed(1)}%`],
                      ['Tendencia',                      `${trend.icon} ${trend.label}`],
                      ['CO₂ estimado capturado',         `${(report.estimated_co2_kg/1000).toFixed(1)} toneladas`],
                      ['Área verificada',                `${project.area_ha} ha`],
                      ['Imágenes Sentinel-2 analizadas', `${series.length} imágenes`],
                      ['Fecha del reporte',              report.report_date],
                    ].map(([l,v])=>(
                      <div key={l}>
                        <div style={{ fontSize:10, color:'#aaa' }}>{l}</div>
                        <div style={{ fontSize:14, fontWeight:600 }}>{v}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ background:'#f0faf5', borderRadius:8, padding:'12px 14px', marginBottom:16 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:22 }}>{report.status === 'Exitoso' ? '✅' : report.status === 'En desarrollo' ? '🔄' : '⚠️'}</span>
                      <div>
                        <div style={{ fontSize:11, color:'#888' }}>ESTADO DE RESTAURACIÓN</div>
                        <div style={{ fontSize:16, fontWeight:700, color:statusColor(report.status) }}>{report.status}</div>
                      </div>
                    </div>
                  </div>

                  <div style={{ background:'#fff8e1', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:11, color:'#856404' }}>
                    ⚠️ <b>Nota metodológica:</b> Las métricas de CO₂ son estimaciones basadas en la relación empírica AGB-NDVI. El monitoreo satelital con Sentinel-2 (10m/px) permite verificar cambios en la cobertura vegetal del área, no el conteo individual de árboles.
                  </div>
                </>
              ) : (
                <div style={{ padding:'20px', textAlign:'center', color:'#888', fontSize:13 }}>
                  Sin datos de verificación todavía — el pipeline generará el primer reporte automáticamente.
                </div>
              )}

              <div style={{ borderTop:'0.5px solid #e8e8e4', paddingTop:14 }}>
                <div style={{ fontSize:10, color:'#aaa', marginBottom:4 }}>HASH DE VERIFICACIÓN SHA-256</div>
                <div style={{ fontFamily:'monospace', fontSize:11, background:'#f5f5f2', padding:'8px 12px', borderRadius:6, color:'#555', wordBreak:'break-all' }}>
                  {report?.report_hash || '—'}
                </div>
                <div style={{ fontSize:10, color:'#aaa', marginTop:6 }}>
                  Generado el {report?.report_date} · ESA Copernicus Sentinel-2 L2A · {series.length} imágenes
                </div>
              </div>
            </div>

            <div style={{ background:'#f9f9f7', borderRadius:12, padding:'14px 16px', fontSize:12, color:'#666', lineHeight:1.7, marginBottom:12 }}>
              <b style={{ color:'#1a1a1a' }}>Metodología:</b> {report?.methodology || 'Verificación basada en NDVI derivado de imágenes Sentinel-2 L2A (ESA Copernicus, resolución 10m/px). Baseline calculado como promedio de imágenes con menos del 20% de nubosidad en los períodos previos a la plantación.'}
            </div>

            {report && (
              <button
                onClick={() => generateCertificatePDF({ project, report, series, sponsor })}
                style={{ width:'100%', padding:'12px', background:'#0d3d2e', color:'white', border:'none', borderRadius:10, fontSize:14, fontWeight:500, cursor:'pointer' }}>
                📄 Descargar certificado PDF
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
