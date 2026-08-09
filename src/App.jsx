import { useState, useEffect } from 'react'
import Dashboard from './Dashboard'
import Onboarding from './Onboarding'
import { supabase } from './supabase'

// ── Lista de proyectos ────────────────────────────────────────
function ProjectList({ onSelect, onNew }) {
  const [projects, setProjects] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    supabase
      .from('projects')
      .select('id, name, location_name, planting_date, trees_planted, area_ha, created_at')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error) setProjects(data || [])
        setLoading(false)
      })
  }, [])

  const statusColor = { Exitoso:'#1D9E75', 'En desarrollo':'#BA7517', 'En riesgo':'#D85A30', Fallido:'#E24B4A' }

  return (
    <div style={{ fontFamily:'-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif', background:'#f5f5f2', minHeight:'100vh', paddingBottom:40 }}>

      {/* Nav */}
      <nav style={{ background:'#0d3d2e', padding:'14px 24px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:20 }}>🌳</span>
          <span style={{ color:'#fff', fontWeight:700, fontSize:15 }}>ForestVerify</span>
        </div>
        <button onClick={onNew} style={{ background:'#1D9E75', color:'#fff', border:'none', borderRadius:8, padding:'8px 18px', fontSize:13, fontWeight:500, cursor:'pointer' }}>
          + Nuevo proyecto
        </button>
      </nav>

      <div style={{ maxWidth:800, margin:'24px auto', padding:'0 16px' }}>
        <div style={{ marginBottom:20 }}>
          <h2 style={{ fontSize:20, fontWeight:600, margin:0, color:'#0d3d2e' }}>Mis proyectos</h2>
          <p style={{ fontSize:13, color:'#888', marginTop:4 }}>
            {loading ? 'Cargando…' : `${projects.length} proyecto${projects.length !== 1 ? 's' : ''} registrado${projects.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        {loading && (
          <div style={{ textAlign:'center', padding:40 }}>
            <div style={{ width:32, height:32, border:'3px solid #1D9E75', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto' }} />
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}

        {!loading && projects.length === 0 && (
          <div style={{ textAlign:'center', padding:'60px 20px', background:'#fff', borderRadius:14, border:'0.5px solid #e8e8e4' }}>
            <div style={{ fontSize:48, marginBottom:12 }}>🌱</div>
            <div style={{ fontSize:16, fontWeight:500, color:'#0d3d2e', marginBottom:8 }}>No hay proyectos todavía</div>
            <div style={{ fontSize:13, color:'#888', marginBottom:20 }}>Registrá tu primer proyecto de restauración</div>
            <button onClick={onNew} style={{ background:'#1D9E75', color:'#fff', border:'none', borderRadius:8, padding:'10px 24px', fontSize:14, fontWeight:500, cursor:'pointer' }}>
              Registrar proyecto
            </button>
          </div>
        )}

        {!loading && projects.map(p => (
          <div key={p.id} onClick={() => onSelect(p.id)} style={{ background:'#fff', border:'0.5px solid #e8e8e4', borderRadius:12, padding:'16px 18px', marginBottom:10, cursor:'pointer', transition:'box-shadow 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div>
                <div style={{ fontSize:15, fontWeight:600, color:'#0d3d2e', marginBottom:3 }}>{p.name}</div>
                <div style={{ fontSize:12, color:'#888' }}>
                  📍 {p.location_name} · {p.trees_planted} árboles · {p.area_ha} ha
                </div>
                <div style={{ fontSize:11, color:'#aaa', marginTop:3 }}>
                  Plantación: {p.planting_date} · ID: {p.id}
                </div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6 }}>
                <span style={{ fontSize:11, color:'#1D9E75', background:'#EAF3DE', padding:'3px 10px', borderRadius:99, fontWeight:500 }}>
                  Ver dashboard →
                </span>
              </div>
            </div>
          </div>
        ))}

        {/* Proyecto demo */}
        <div style={{ marginTop:16, borderTop:'0.5px solid #e8e8e4', paddingTop:16 }}>
          <div style={{ fontSize:12, color:'#aaa', marginBottom:8 }}>Proyecto de demostración</div>
          <div onClick={() => onSelect('PROJ-2024-001')} style={{ background:'#f0faf5', border:'0.5px solid #c8e6d8', borderRadius:12, padding:'14px 18px', cursor:'pointer' }}>
            <div style={{ fontSize:14, fontWeight:500, color:'#1a5c42' }}>🌳 Restauración Quebrada del Tigre</div>
            <div style={{ fontSize:12, color:'#5a9e2f', marginTop:3 }}>Unquillo, Córdoba · 500 árboles · 2.5 ha · Con datos NDVI completos</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── App principal ─────────────────────────────────────────────
export default function App() {
  const [page, setPage]         = useState('home')
  const [projectId, setProjectId] = useState(null)

  function goToDashboard(pid) {
    setProjectId(pid)
    setPage('dashboard')
  }

  function handleOnboardingSuccess(pid) {
    setProjectId(pid)
    setPage('dashboard')
  }

  if (page === 'onboarding') {
    return <Onboarding onSuccess={handleOnboardingSuccess} />
  }

  if (page === 'projects') {
    return (
      <ProjectList
        onSelect={goToDashboard}
        onNew={() => setPage('onboarding')}
      />
    )
  }

  if (page === 'dashboard') {
    return (
      <div>
        <div style={{ background:'#0d3d2e', padding:'10px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:18 }}>🌳</span>
            <span style={{ color:'#fff', fontWeight:600, fontSize:14 }}>ForestVerify</span>
          </div>
          <div style={{ display:'flex', gap:12 }}>
            <button onClick={()=>setPage('projects')} style={{ fontSize:12, color:'rgba(255,255,255,0.7)', background:'none', border:'none', cursor:'pointer' }}>
              ← Mis proyectos
            </button>
            <button onClick={()=>setPage('home')} style={{ fontSize:12, color:'rgba(255,255,255,0.5)', background:'none', border:'none', cursor:'pointer' }}>
              Inicio
            </button>
          </div>
        </div>
        <Dashboard projectId={projectId} />
      </div>
    )
  }

  // ── LANDING PAGE ─────────────────────────────────────────────
  return (
    <div style={{ fontFamily:'-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif', background:'#f5f5f2', minHeight:'100vh' }}>

      {/* Nav */}
      <nav style={{ background:'#0d3d2e', padding:'14px 24px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:22 }}>🌳</span>
          <span style={{ color:'#fff', fontWeight:700, fontSize:16 }}>ForestVerify</span>
        </div>
        <div style={{ display:'flex', gap:12 }}>
          <button onClick={()=>setPage('projects')} style={{ fontSize:13, color:'rgba(255,255,255,0.8)', background:'none', border:'none', cursor:'pointer' }}>
            Mis proyectos
          </button>
          <button onClick={()=>setPage('onboarding')} style={{ background:'#1D9E75', color:'#fff', border:'none', borderRadius:8, padding:'8px 18px', fontSize:13, fontWeight:500, cursor:'pointer' }}>
            Registrar proyecto
          </button>
        </div>
      </nav>

      {/* Hero */}
      <div style={{ background:'linear-gradient(160deg,#0d3d2e 0%,#1a5c42 60%,#2d8a60 100%)', padding:'80px 24px 100px', textAlign:'center' }}>
        <div style={{ display:'inline-flex', alignItems:'center', gap:8, background:'rgba(255,255,255,0.1)', border:'0.5px solid rgba(255,255,255,0.2)', borderRadius:99, padding:'6px 16px', marginBottom:28 }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background:'#5ef0a0', display:'inline-block' }} />
          <span style={{ fontSize:12, color:'rgba(255,255,255,0.9)', fontWeight:500 }}>Verificación satelital · Sentinel-2 ESA Copernicus</span>
        </div>
        <h1 style={{ fontSize:'clamp(28px,5vw,54px)', fontWeight:800, color:'#fff', lineHeight:1.15, marginBottom:20 }}>
          Cada árbol plantado,<br />
          <span style={{ color:'#5ef0a0' }}>verificado desde el espacio</span>
        </h1>
        <p style={{ fontSize:'clamp(14px,2vw,18px)', color:'rgba(255,255,255,0.8)', lineHeight:1.7, marginBottom:36, maxWidth:520, margin:'0 auto 36px' }}>
          Conectamos empresas y donantes con proyectos de restauración forestal, con evidencia satelital automática e independiente.
        </p>
        <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
          <button onClick={()=>setPage('onboarding')} style={{ background:'#1D9E75', color:'#fff', border:'none', borderRadius:10, padding:'14px 28px', fontSize:15, fontWeight:600, cursor:'pointer', boxShadow:'0 4px 24px rgba(29,158,117,0.5)' }}>
            Registrar mi proyecto →
          </button>
          <button onClick={()=>goToDashboard('PROJ-2024-001')} style={{ background:'rgba(255,255,255,0.1)', color:'#fff', border:'1px solid rgba(255,255,255,0.25)', borderRadius:10, padding:'14px 28px', fontSize:15, cursor:'pointer' }}>
            Ver demo
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ background:'#fff', padding:'48px 24px' }}>
        <div style={{ maxWidth:800, margin:'0 auto', display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:24, textAlign:'center' }}>
          {[['🌳','12.400+','Árboles verificados'],['🛰️','847','Imágenes procesadas'],['📋','23','Proyectos activos'],['🏢','18','Empresas sponsor']].map(([icon,n,label])=>(
            <div key={label}>
              <div style={{ fontSize:32, marginBottom:8 }}>{icon}</div>
              <div style={{ fontSize:32, fontWeight:800, color:'#0d3d2e' }}>{n}</div>
              <div style={{ fontSize:13, color:'#888', marginTop:4 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Cómo funciona */}
      <div style={{ background:'#f5f5f2', padding:'60px 24px' }}>
        <div style={{ maxWidth:860, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:40 }}>
            <div style={{ fontSize:12, fontWeight:600, color:'#1D9E75', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:10 }}>Cómo funciona</div>
            <h2 style={{ fontSize:'clamp(22px,4vw,36px)', fontWeight:800, color:'#0d3d2e', margin:0 }}>De la semilla al certificado</h2>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:16 }}>
            {[
              ['🌱','ONG','Registrá el proyecto','Dibujá el polígono del área y cargá los datos de la plantación.'],
              ['🛰️','Sistema','Monitoreo automático','Procesamos imágenes Sentinel-2 cada 30 días y calculamos el NDVI.'],
              ['🏢','Empresa','Apadrinar árboles','La empresa elige el proyecto, paga y recibe su dashboard en tiempo real.'],
              ['📄','Sistema','Certificado verificable','PDF con hash SHA-256 que prueba la restauración con evidencia satelital.'],
            ].map(([icon,who,title,desc])=>(
              <div key={title} style={{ background:'#fff', borderRadius:14, padding:'22px 18px', position:'relative' }}>
                <div style={{ position:'absolute', top:14, right:14, fontSize:10, fontWeight:600, color:'#1D9E75', background:'#EAF3DE', borderRadius:99, padding:'2px 8px' }}>{who}</div>
                <div style={{ fontSize:28, marginBottom:12 }}>{icon}</div>
                <div style={{ fontSize:15, fontWeight:700, color:'#0d3d2e', marginBottom:8 }}>{title}</div>
                <div style={{ fontSize:13, color:'#666', lineHeight:1.6 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Precios */}
      <div style={{ background:'#fff', padding:'60px 24px' }}>
        <div style={{ maxWidth:860, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:40 }}>
            <div style={{ fontSize:12, fontWeight:600, color:'#1D9E75', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:10 }}>Precios</div>
            <h2 style={{ fontSize:'clamp(22px,4vw,36px)', fontWeight:800, color:'#0d3d2e', margin:0 }}>Transparente y escalable</h2>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))', gap:16 }}>
            {[
              ['🌱','Básico','USD 2–5','árbol / año','Para particulares y donantes',['Dashboard público','Verificación mensual','Badge digital','1 certificado anual'],false],
              ['🏢','Empresa','USD 0.5–2','árbol / año','Para RSE corporativa',['Dashboard privado','Reportes trimestrales PDF','Certificado SHA-256','Exportación GeoJSON / CSV'],true],
              ['🌍','Carbono','USD 5–15','tCO₂ verificada','Para mercado de carbono',['Metodología Verra-compatible','Serie temporal auditada','Conexión QGIS / PostGIS','Consultoría incluida'],false],
            ].map(([icon,name,price,per,desc,features,highlight])=>(
              <div key={name} style={{ borderRadius:16, border:`1.5px solid ${highlight?'#1D9E75':'#e8e8e4'}`, padding:'24px 20px', background:highlight?'#f0faf5':'#fff', position:'relative' }}>
                {highlight && <div style={{ position:'absolute', top:-12, left:'50%', transform:'translateX(-50%)', background:'#1D9E75', color:'#fff', fontSize:11, fontWeight:600, padding:'4px 16px', borderRadius:99 }}>Más popular</div>}
                <div style={{ fontSize:28, marginBottom:8 }}>{icon}</div>
                <div style={{ fontSize:17, fontWeight:700, color:'#0d3d2e' }}>{name}</div>
                <div style={{ fontSize:11, color:'#aaa', marginBottom:14 }}>{desc}</div>
                <div style={{ fontSize:26, fontWeight:800, color:'#1D9E75', lineHeight:1 }}>{price}</div>
                <div style={{ fontSize:12, color:'#aaa', marginBottom:18 }}>{per}</div>
                {features.map(f=>(
                  <div key={f} style={{ display:'flex', gap:8, marginBottom:7, fontSize:13, color:'#555' }}>
                    <span style={{ color:'#1D9E75', flexShrink:0 }}>✓</span>{f}
                  </div>
                ))}
                <button onClick={()=>setPage('onboarding')} style={{ width:'100%', marginTop:18, padding:'10px', borderRadius:9, border:`1.5px solid #1D9E75`, background:highlight?'#1D9E75':'transparent', color:highlight?'#fff':'#1D9E75', fontSize:13, fontWeight:500, cursor:'pointer' }}>
                  Empezar →
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{ background:'linear-gradient(135deg,#0d3d2e 0%,#1a5c42 100%)', padding:'60px 24px', textAlign:'center' }}>
        <div style={{ maxWidth:560, margin:'0 auto' }}>
          <div style={{ fontSize:40, marginBottom:16 }}>🛰️</div>
          <h2 style={{ fontSize:'clamp(22px,4vw,38px)', fontWeight:800, color:'#fff', marginBottom:16 }}>Tu restauración merece ser verificada</h2>
          <p style={{ fontSize:14, color:'rgba(255,255,255,0.75)', marginBottom:32, lineHeight:1.7 }}>
            Registrá tu proyecto en menos de 10 minutos. El primer reporte satelital es gratis.
          </p>
          <button onClick={()=>setPage('onboarding')} style={{ background:'#1D9E75', color:'#fff', border:'none', borderRadius:10, padding:'14px 32px', fontSize:15, fontWeight:600, cursor:'pointer' }}>
            Registrar mi proyecto gratis →
          </button>
          <div style={{ marginTop:20, fontSize:12, color:'rgba(255,255,255,0.4)' }}>Sin tarjeta de crédito · Primer reporte gratuito</div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ background:'#071f17', padding:'24px', textAlign:'center' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginBottom:10 }}>
          <span style={{ fontSize:16 }}>🌳</span>
          <span style={{ fontWeight:700, color:'rgba(255,255,255,0.7)', fontSize:14 }}>ForestVerify</span>
        </div>
        <div style={{ fontSize:12, color:'rgba(255,255,255,0.3)' }}>Verificación satelital de restauración forestal · Córdoba, Argentina</div>
      </div>
    </div>
  )
}