import { useState, useEffect } from 'react'
import { fetchProject, fetchNDVI, fetchLatestReport, fetchSponsor } from './supabase'
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'

const PROJECT_ID = 'PROJ-2024-001'

const ndviColor = v => v >= 0.5 ? '#1a7a3f' : v >= 0.3 ? '#1D9E75' : v >= 0.1 ? '#a8c840' : '#c8b830'
const statusColor = s => ({ Exitoso: '#1D9E75', 'En desarrollo': '#BA7517', 'En riesgo': '#D85A30', Fallido: '#E24B4A' }[s] || '#888')

function Badge({ color, children }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 10px', borderRadius: 99, background: color + '22', color, border: `1px solid ${color}44` }}>
      {children}
    </span>
  )
}

function StatCard({ icon, label, value, sub, color }) {
  return (
    <div style={{ background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{icon} {label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || '#1a1a1a' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 8, padding: '8px 12px', fontSize: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
      <div style={{ color: '#888', marginBottom: 3 }}>{label}</div>
      <div style={{ color: ndviColor(payload[0]?.value), fontWeight: 600 }}>NDVI: {payload[0]?.value?.toFixed(3)}</div>
      {payload[1] && <div style={{ color: '#3aab5c' }}>Cobertura: {payload[1]?.value?.toFixed(1)}%</div>}
    </div>
  )
}

export default function App() {
  const [project, setProject]   = useState(null)
  const [report,  setReport]    = useState(null)
  const [series,  setSeries]    = useState([])
  const [sponsor, setSponsor]   = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error,   setError]     = useState('')
  const [tab,     setTab]       = useState('resumen')

  useEffect(() => {
    async function load() {
      try {
        const [proj, rep, ndvi, sp] = await Promise.all([
          fetchProject(PROJECT_ID),
          fetchLatestReport(PROJECT_ID),
          fetchNDVI(PROJECT_ID),
          fetchSponsor(PROJECT_ID),
        ])
        setProject(proj)
        setReport(rep)
        setSeries(ndvi.map(r => ({ ...r, date: r.date.slice(0, 7) })))
        setSponsor(sp)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 12 }}>
      <div style={{ width: 36, height: 36, border: '3px solid #1D9E75', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <span style={{ fontSize: 13, color: '#888' }}>Cargando datos desde Supabase…</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div style={{ textAlign: 'center', maxWidth: 340 }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 14, color: '#991B1B', marginBottom: 16 }}>{error}</div>
        <button onClick={() => window.location.reload()} style={{ padding: '8px 20px', borderRadius: 8, border: '0.5px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
          Reintentar
        </button>
      </div>
    </div>
  )

  const latestNdvi   = series[series.length - 1]?.ndvi_mean || 0
  const baselineNdvi = report?.baseline_ndvi || 0
  const months       = Math.round((new Date() - new Date(project.planting_date)) / (1000 * 60 * 60 * 24 * 30))

  return (
    <div style={{ fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif', background: '#f5f5f2', minHeight: '100vh', paddingBottom: 40 }}>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e8e4', padding: '14px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 20 }}>🌳</span>
              <span style={{ fontSize: 16, fontWeight: 600 }}>{project.name}</span>
              {report && <Badge color={statusColor(report.status)}>{report.status}</Badge>}
            </div>
            <div style={{ fontSize: 12, color: '#888' }}>
              📍 {project.location_name} · {months} meses de monitoreo · {series.length} imágenes satelitales
            </div>
          </div>
          {sponsor && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#aaa' }}>Sponsor</div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{sponsor.sponsor_name}</div>
              <div style={{ fontSize: 11, color: '#888' }}>{sponsor.trees_sponsored} árboles · Tier {sponsor.tier}</div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '10px 20px 0', background: '#fff', borderBottom: '0.5px solid #e8e8e4', overflowX: 'auto' }}>
        {[['resumen', 'Resumen'], ['serie', 'Serie NDVI'], ['certificado', 'Certificado']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '7px 16px', borderRadius: '8px 8px 0 0', border: '0.5px solid #e8e8e4', borderBottom: tab === k ? '2px solid #1D9E75' : '0.5px solid #e8e8e4', background: '#fff', fontSize: 13, fontWeight: tab === k ? 500 : 400, color: tab === k ? '#1D9E75' : '#888', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {l}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 860, margin: '16px auto', padding: '0 16px' }}>

        {/* ── RESUMEN ── */}
        {tab === 'resumen' && report && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 14 }}>
              <StatCard icon="🌿" label="NDVI actual"     value={latestNdvi.toFixed(3)}                    sub={`Baseline: ${baselineNdvi.toFixed(3)}`}       color={ndviColor(latestNdvi)} />
              <StatCard icon="📈" label="Cambio NDVI"     value={`+${report.delta_ndvi.toFixed(2)}`}       sub="vs. antes de plantar"                          color="#1D9E75" />
              <StatCard icon="🟢" label="Cobertura verde" value={`+${report.green_cover_gain_pct.toFixed(1)}%`} sub="ganancia de área"                         color="#3aab5c" />
              <StatCard icon="🌳" label="Árboles vivos"   value={`~${report.estimated_trees_alive}`}       sub={`de ${project.trees_planted} plantados`}       color="#1a7a3f" />
              <StatCard icon="💨" label="CO₂ capturado"   value={`${(report.estimated_co2_kg / 1000).toFixed(1)} t`} sub="estimación"                          color="#185FA5" />
              <StatCard icon="✅" label="Tasa de éxito"   value={`${report.success_rate_pct}%`}            sub="supervivencia estimada"                        color={report.success_rate_pct > 70 ? '#1D9E75' : '#D85A30'} />
            </div>

            <div style={{ background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 12, padding: '16px', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>Evolución NDVI</div>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 14 }}>Sentinel-2 · {series.length} imágenes · {project.area_ha} ha</div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={series}>
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#1D9E75" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#1D9E75" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 0.8]} tick={{ fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={0.3} stroke="#BA7517" strokeDasharray="4 2" label={{ value: '0.30', fontSize: 9, fill: '#BA7517' }} />
                  <ReferenceLine y={0.5} stroke="#1D9E75" strokeDasharray="4 2" />
                  <ReferenceLine x={project.planting_date?.slice(0, 7)} stroke="#E24B4A" strokeDasharray="4 2" label={{ value: 'Plantación', fontSize: 9, fill: '#E24B4A' }} />
                  <Area type="monotone" dataKey="ndvi_mean" stroke="#1D9E75" fill="url(#g1)" strokeWidth={2.5} dot={{ r: 3, fill: '#1D9E75' }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#666', marginBottom: 10 }}>Proyecto</div>
                {[['Área', `${project.area_ha} ha`], ['Plantación', project.planting_date], ['Árboles', project.trees_planted], ['Imágenes', series.length]].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                    <span style={{ color: '#888' }}>{l}</span><span style={{ fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{ background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#666', marginBottom: 10 }}>Último reporte</div>
                {[['Fecha', report.report_date], ['NDVI baseline', baselineNdvi.toFixed(3)], ['NDVI actual', latestNdvi.toFixed(3)], ['Estado', report.status]].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                    <span style={{ color: '#888' }}>{l}</span><span style={{ fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── SERIE NDVI ── */}
        {tab === 'serie' && (
          <div>
            <div style={{ background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 12, padding: '16px', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 14 }}>NDVI + Cobertura verde</div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={series}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="ndvi" domain={[0, 0.8]} tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="cov" orientation="right" domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine yAxisId="ndvi" y={0.3} stroke="#BA7517" strokeDasharray="4 2" />
                  <Line yAxisId="ndvi" type="monotone" dataKey="ndvi_mean"       stroke="#1D9E75" strokeWidth={2.5} dot={{ r: 4 }} />
                  <Line yAxisId="cov"  type="monotone" dataKey="green_cover_pct" stroke="#3aab5c" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div style={{ background: '#fff', border: '0.5px solid #e8e8e4', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #e8e8e4', fontSize: 13, fontWeight: 500 }}>
                Registros satelitales ({series.length} imágenes)
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f9f9f7' }}>
                      {['Fecha', 'NDVI', 'Min', 'Max', 'Cobertura', 'Veg. densa', 'Nubes', 'Hash'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#888', fontWeight: 500, borderBottom: '0.5px solid #e8e8e4', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...series].reverse().map((r, i) => (
                      <tr key={i} style={{ borderBottom: '0.5px solid #f0f0ec' }}>
                        <td style={{ padding: '7px 12px', fontWeight: 500 }}>{r.date}</td>
                        <td style={{ padding: '7px 12px', color: ndviColor(r.ndvi_mean), fontWeight: 600 }}>{r.ndvi_mean?.toFixed(3)}</td>
                        <td style={{ padding: '7px 12px', color: '#888' }}>{r.ndvi_min?.toFixed(3)}</td>
                        <td style={{ padding: '7px 12px', color: '#888' }}>{r.ndvi_max?.toFixed(3)}</td>
                        <td style={{ padding: '7px 12px' }}>{r.green_cover_pct?.toFixed(1)}%</td>
                        <td style={{ padding: '7px 12px' }}>{r.dense_veg_pct?.toFixed(1)}%</td>
                        <td style={{ padding: '7px 12px', color: '#aaa' }}>{r.cloud_cover?.toFixed(1)}%</td>
                        <td style={{ padding: '7px 12px', fontFamily: 'monospace', fontSize: 10, color: '#bbb' }}>{r.image_hash}…</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── CERTIFICADO ── */}
        {tab === 'certificado' && report && (
          <div>
            <div style={{ background: '#fff', border: '1px solid #1D9E75', borderRadius: 14, padding: '24px', marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>CERTIFICADO DE VERIFICACIÓN SATELITAL</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{project.name}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>{project.location_name}</div>
                </div>
                <span style={{ fontSize: 32 }}>🛰️</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                {[
                  ['Árboles verificados', `~${report.estimated_trees_alive} de ${project.trees_planted}`],
                  ['Tasa de éxito', `${report.success_rate_pct}%`],
                  ['NDVI inicial', baselineNdvi.toFixed(3)],
                  ['NDVI actual', latestNdvi.toFixed(3)],
                  ['Ganancia cobertura', `+${report.green_cover_gain_pct?.toFixed(1)}%`],
                  ['CO₂ estimado', `${(report.estimated_co2_kg / 1000).toFixed(1)} t`],
                  ['Área verificada', `${project.area_ha} ha`],
                  ['Imágenes analizadas', series.length],
                ].map(([l, v]) => (
                  <div key={l}>
                    <div style={{ fontSize: 10, color: '#aaa' }}>{l}</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{v}</div>
                  </div>
                ))}
              </div>

              <div style={{ background: '#f0faf5', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 22 }}>{report.status === 'Exitoso' ? '✅' : '⚠️'}</span>
                  <div>
                    <div style={{ fontSize: 11, color: '#888' }}>ESTADO</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: statusColor(report.status) }}>{report.status}</div>
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '0.5px solid #e8e8e4', paddingTop: 14 }}>
                <div style={{ fontSize: 10, color: '#aaa', marginBottom: 4 }}>HASH DE VERIFICACIÓN SHA-256</div>
                <div style={{ fontFamily: 'monospace', fontSize: 11, background: '#f5f5f2', padding: '8px 12px', borderRadius: 6, color: '#555', wordBreak: 'break-all' }}>
                  {report.report_hash}
                </div>
                <div style={{ fontSize: 10, color: '#aaa', marginTop: 6 }}>
                  Generado el {report.report_date} · ESA Copernicus Sentinel-2 L2A · {series.length} imágenes
                </div>
              </div>
            </div>

            <div style={{ background: '#f9f9f7', borderRadius: 12, padding: '14px 16px', fontSize: 12, color: '#666', lineHeight: 1.7 }}>
              <b style={{ color: '#1a1a1a' }}>Metodología:</b> {report.methodology}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}