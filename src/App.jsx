import { useState, useEffect } from 'react'
import Dashboard from './Dashboard'
import Onboarding from './Onboarding'
import Auth from './Auth'
import { supabase, getCurrentUser, signOut, onAuthChange } from './supabase'

// ── Modal de edición ──────────────────────────────────────────
function EditModal({ project, onSave, onClose }) {
  const [form, setForm] = useState({
    name:          project.name          || '',
    location_name: project.location_name || '',
    description:   project.description   || '',
    trees_planted: project.trees_planted || '',
    area_ha:       project.area_ha       || '',
    planting_date: project.planting_date || '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const f = (k,v) => setForm(x => ({...x,[k]:v}))

  async function save() {
    if (!form.name) { setError('El nombre es obligatorio.'); return }
    setSaving(true); setError('')
    try {
      const { error: err } = await supabase.from('projects').update({
        name:          form.name,
        location_name: form.location_name,
        description:   form.description,
        trees_planted: +form.trees_planted || 0,
        area_ha:       +form.area_ha       || 0,
        planting_date: form.planting_date  || null,
      }).eq('id', project.id)
      if (err) throw err
      onSave()
    } catch(e) { setError(e.message) }
    finally    { setSaving(false) }
  }

  const inp = { width:'100%', padding:'8px 10px', border:'0.5px solid #ddd', borderRadius:8, fontSize:13, fontFamily:'inherit', background:'#fff', boxSizing:'border-box', marginBottom:10 }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }} onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:14, padding:'24px 20px', maxWidth:480, width:'100%' }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
          <h3 style={{ margin:0, fontSize:16, fontWeight:600 }}>Editar proyecto</h3>
          <button onClick={onClose} style={{ border:'none', background:'none', fontSize:20, cursor:'pointer', color:'#888' }}>×</button>
        </div>
        <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>Nombre *</label>
        <input style={inp} value={form.name} onChange={e=>f('name',e.target.value)} />
        <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>Localidad</label>
        <input style={inp} value={form.location_name} onChange={e=>f('location_name',e.target.value)} />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div>
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>Árboles plantados</label>
            <input style={inp} type="number" value={form.trees_planted} onChange={e=>f('trees_planted',e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>Área (ha)</label>
            <input style={inp} type="number" step="0.1" value={form.area_ha} onChange={e=>f('area_ha',e.target.value)} />
          </div>
        </div>
        <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>Fecha de plantación</label>
        <input style={inp} type="date" value={form.planting_date} onChange={e=>f('planting_date',e.target.value)} />
        <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>Descripción</label>
        <textarea style={{ ...inp, resize:'vertical', marginBottom:14 }} rows={3} value={form.description} onChange={e=>f('description',e.target.value)} />
        {error && <div style={{ background:'#FEF2F2', border:'0.5px solid #FECACA', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#991B1B', marginBottom:12 }}>{error}</div>}
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ padding:'8px 20px', borderRadius:8, border:'0.5px solid #ddd', background:'#fff', fontSize:13, cursor:'pointer' }}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{ padding:'8px 20px', borderRadius:8, border:'none', background:'#1D9E75', color:'#fff', fontSize:13, fontWeight:500, cursor:'pointer' }}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal de eliminación ──────────────────────────────────────
function DeleteModal({ project, onConfirm, onClose }) {
  const [deleting, setDeleting] = useState(false)

  async function confirm() {
    setDeleting(true)
    try {
      const { error } = await supabase.from('projects').delete().eq('id', project.id)
      if (error) throw error
      onConfirm()
    } catch(e) { alert('Error al eliminar: ' + e.message); setDeleting(false) }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }} onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:14, padding:'28px 24px', maxWidth:400, width:'100%', textAlign:'center' }} onClick={e=>e.stopPropagation()}>
        <div style={{ fontSize:40, marginBottom:12 }}>🗑️</div>
        <h3 style={{ margin:'0 0 8px', fontSize:16, fontWeight:600 }}>Eliminar proyecto</h3>
        <p style={{ fontSize:13, color:'#666', marginBottom:20 }}>
          ¿Estás seguro de que querés eliminar <b>{project.name}</b>?<br />
          Se eliminarán todos los registros NDVI y reportes asociados.
        </p>
        <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
          <button onClick={onClose} style={{ padding:'9px 22px', borderRadius:8, border:'0.5px solid #ddd', background:'#fff', fontSize:13, cursor:'pointer' }}>Cancelar</button>
          <button onClick={confirm} disabled={deleting} style={{ padding:'9px 22px', borderRadius:8, border:'none', background:'#E24B4A', color:'#fff', fontSize:13, fontWeight:500, cursor:'pointer' }}>
            {deleting ? 'Eliminando…' : 'Sí, eliminar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Lista de proyectos ────────────────────────────────────────
function ProjectList({ user, onSelect, onNew, onSignOut }) {
  const [projects, setProjects] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [editing,  setEditing]  = useState(null)
  const [deleting, setDeleting] = useState(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('projects')
      .select('id, name, location_name, planting_date, trees_planted, area_ha, created_at')
      .order('created_at', { ascending: false })
    setProjects(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  return (
    <div style={{ fontFamily:'-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif', background:'#f5f5f2', minHeight:'100vh', paddingBottom:40 }}>
      <nav style={{ background:'#0d3d2e', padding:'12px 24px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:20 }}>🌳</span>
          <div>
            <span style={{ color:'#fff', fontWeight:700, fontSize:15 }}>ForestVerify</span>
            {user && <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)' }}>{user.email}</div>}
          </div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {user && (
            <button onClick={onSignOut} style={{ fontSize:12, color:'rgba(255,255,255,0.7)', background:'none', border:'0.5px solid rgba(255,255,255,0.3)', borderRadius:6, padding:'5px 12px', cursor:'pointer' }}>
              Cerrar sesión
            </button>
          )}
          <button onClick={onNew} style={{ background:'#1D9E75', color:'#fff', border:'none', borderRadius:8, padding:'8px 18px', fontSize:13, fontWeight:500, cursor:'pointer' }}>
            + Nuevo proyecto
          </button>
        </div>
      </nav>

      <div style={{ maxWidth:800, margin:'24px auto', padding:'0 16px' }}>
        <div style={{ marginBottom:20 }}>
          <h2 style={{ fontSize:20, fontWeight:600, margin:0, color:'#0d3d2e' }}>Mis proyectos</h2>
          <p style={{ fontSize:13, color:'#888', marginTop:4 }}>
            {loading ? 'Cargando…' : `${projects.length} proyecto${projects.length !== 1?'s':''} registrado${projects.length !== 1?'s':''}`}
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
          <div key={p.id} style={{ background:'#fff', border:'0.5px solid #e8e8e4', borderRadius:12, padding:'14px 16px', marginBottom:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div style={{ flex:1, cursor:'pointer' }} onClick={() => onSelect(p.id)}>
                <div style={{ fontSize:15, fontWeight:600, color:'#0d3d2e', marginBottom:3 }}>{p.name}</div>
                <div style={{ fontSize:12, color:'#888' }}>📍 {p.location_name} · {p.trees_planted} árboles · {p.area_ha} ha</div>
                <div style={{ fontSize:11, color:'#aaa', marginTop:3 }}>Plantación: {p.planting_date} · ID: {p.id}</div>
              </div>
              <div style={{ display:'flex', gap:6, flexShrink:0, marginLeft:12 }}>
                <button onClick={() => setEditing(p)}  style={{ fontSize:12, padding:'6px 12px', borderRadius:7, border:'0.5px solid #ddd', background:'#fff', cursor:'pointer', color:'#555' }}>✏️ Editar</button>
                <button onClick={() => setDeleting(p)} style={{ fontSize:12, padding:'6px 12px', borderRadius:7, border:'0.5px solid #FECACA', background:'#FEF2F2', cursor:'pointer', color:'#E24B4A' }}>🗑️ Eliminar</button>
                <button onClick={() => onSelect(p.id)} style={{ fontSize:12, padding:'6px 12px', borderRadius:7, border:'0.5px solid #1D9E75', background:'#EAF3DE', cursor:'pointer', color:'#1D9E75', fontWeight:500 }}>Ver →</button>
              </div>
            </div>
          </div>
        ))}

        <div style={{ marginTop:16, borderTop:'0.5px solid #e8e8e4', paddingTop:16 }}>
          <div style={{ fontSize:12, color:'#aaa', marginBottom:8 }}>Proyecto de demostración</div>
          <div onClick={() => onSelect('PROJ-2024-001')} style={{ background:'#f0faf5', border:'0.5px solid #c8e6d8', borderRadius:12, padding:'14px 18px', cursor:'pointer' }}>
            <div style={{ fontSize:14, fontWeight:500, color:'#1a5c42' }}>🌳 Restauración Quebrada del Tigre</div>
            <div style={{ fontSize:12, color:'#5a9e2f', marginTop:3 }}>Unquillo, Córdoba · 500 árboles · 2.5 ha · Con datos NDVI completos</div>
          </div>
        </div>
      </div>

      {editing  && <EditModal  project={editing}  onSave={()=>{ setEditing(null);  load() }} onClose={()=>setEditing(null)}  />}
      {deleting && <DeleteModal project={deleting} onConfirm={()=>{ setDeleting(null); load() }} onClose={()=>setDeleting(null)} />}
    </div>
  )
}

// ── App principal ─────────────────────────────────────────────
export default function App() {
  const [page,      setPage]      = useState('home')
  const [projectId, setProjectId] = useState(null)
  const [user,      setUser]      = useState(undefined)

  useEffect(() => {
    getCurrentUser().then(setUser)
    const { data: { subscription } } = onAuthChange(setUser)
    return () => subscription.unsubscribe()
  }, [])

  // Cargando sesión
  if (user === undefined) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}>
      <div style={{ width:32, height:32, border:'3px solid #1D9E75', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  function goToDashboard(pid) { setProjectId(pid); setPage('dashboard') }
  function handleSignOut()    { signOut(); setUser(null); setPage('home') }

  if (page === 'auth') {
    return <Auth onAuth={(u) => { setUser(u); setPage(u ? 'projects' : 'home') }} />
  }

  if (page === 'onboarding') {
    return <Onboarding onSuccess={(pid) => { setProjectId(pid); setPage('dashboard') }} />
  }

  if (page === 'projects') {
    return (
      <ProjectList
        user={user}
        onSelect={goToDashboard}
        onNew={() => user ? setPage('onboarding') : setPage('auth')}
        onSignOut={handleSignOut}
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
          <div style={{ display:'flex', gap:12, alignItems:'center' }}>
            {user && <button onClick={handleSignOut} style={{ fontSize:12, color:'rgba(255,255,255,0.6)', background:'none', border:'0.5px solid rgba(255,255,255,0.3)', borderRadius:6, padding:'4px 10px', cursor:'pointer' }}>Cerrar sesión</button>}
            <button onClick={() => setPage('projects')} style={{ fontSize:12, color:'rgba(255,255,255,0.7)', background:'none', border:'none', cursor:'pointer' }}>← Mis proyectos</button>
            <button onClick={() => setPage('home')}     style={{ fontSize:12, color:'rgba(255,255,255,0.5)', background:'none', border:'none', cursor:'pointer' }}>Inicio</button>
          </div>
        </div>
        <Dashboard projectId={projectId} />
      </div>
    )
  }

  // ── LANDING PAGE ──────────────────────────────────────────────
  return (
    <div style={{ fontFamily:'-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif', background:'#f5f5f2', minHeight:'100vh' }}>
      <nav style={{ background:'#0d3d2e', padding:'14px 24px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:22 }}>🌳</span>
          <span style={{ color:'#fff', fontWeight:700, fontSize:16 }}>ForestVerify</span>
        </div>
        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
          {user
            ? <>
                <span style={{ fontSize:12, color:'rgba(255,255,255,0.6)' }}>{user.email}</span>
                <button onClick={() => setPage('projects')} style={{ fontSize:13, color:'rgba(255,255,255,0.8)', background:'none', border:'none', cursor:'pointer' }}>Mis proyectos</button>
                <button onClick={handleSignOut} style={{ fontSize:12, color:'rgba(255,255,255,0.6)', background:'none', border:'0.5px solid rgba(255,255,255,0.3)', borderRadius:6, padding:'5px 12px', cursor:'pointer' }}>Cerrar sesión</button>
              </>
            : <>
                <button onClick={() => setPage('auth')} style={{ fontSize:13, color:'rgba(255,255,255,0.8)', background:'none', border:'none', cursor:'pointer' }}>Iniciar sesión</button>
                <button onClick={() => setPage('onboarding')} style={{ background:'#1D9E75', color:'#fff', border:'none', borderRadius:8, padding:'8px 18px', fontSize:13, fontWeight:500, cursor:'pointer' }}>Registrar proyecto</button>
              </>
          }
        </div>
      </nav>

      <div style={{ background:'linear-gradient(160deg,#0d3d2e 0%,#1a5c42 60%,#2d8a60 100%)', padding:'80px 24px 100px', textAlign:'center' }}>
        <div style={{ display:'inline-flex', alignItems:'center', gap:8, background:'rgba(255,255,255,0.1)', border:'0.5px solid rgba(255,255,255,0.2)', borderRadius:99, padding:'6px 16px', marginBottom:28 }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background:'#5ef0a0', display:'inline-block' }} />
          <span style={{ fontSize:12, color:'rgba(255,255,255,0.9)', fontWeight:500 }}>Verificación satelital · Sentinel-2 ESA Copernicus</span>
        </div>
        <h1 style={{ fontSize:'clamp(28px,5vw,54px)', fontWeight:800, color:'#fff', lineHeight:1.15, marginBottom:20 }}>
          Cada árbol plantado,<br /><span style={{ color:'#5ef0a0' }}>verificado desde el espacio</span>
        </h1>
        <p style={{ fontSize:'clamp(14px,2vw,18px)', color:'rgba(255,255,255,0.8)', lineHeight:1.7, marginBottom:36, maxWidth:520, margin:'0 auto 36px' }}>
          Conectamos empresas y donantes con proyectos de restauración forestal, con evidencia satelital automática e independiente.
        </p>
        <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
          <button onClick={() => setPage('onboarding')} style={{ background:'#1D9E75', color:'#fff', border:'none', borderRadius:10, padding:'14px 28px', fontSize:15, fontWeight:600, cursor:'pointer', boxShadow:'0 4px 24px rgba(29,158,117,0.5)' }}>
            Registrar mi proyecto →
          </button>
          <button onClick={() => goToDashboard('PROJ-2024-001')} style={{ background:'rgba(255,255,255,0.1)', color:'#fff', border:'1px solid rgba(255,255,255,0.25)', borderRadius:10, padding:'14px 28px', fontSize:15, cursor:'pointer' }}>
            Ver demo
          </button>
        </div>
      </div>

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

      <div style={{ background:'#f5f5f2', padding:'60px 24px' }}>
        <div style={{ maxWidth:860, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:40 }}>
            <div style={{ fontSize:12, fontWeight:600, color:'#1D9E75', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:10 }}>Cómo funciona</div>
            <h2 style={{ fontSize:'clamp(22px,4vw,36px)', fontWeight:800, color:'#0d3d2e', margin:0 }}>De la semilla al certificado</h2>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:16 }}>
            {[['🌱','ONG','Registrá el proyecto','Dibujá el polígono del área y cargá los datos de la plantación.'],['🛰️','Sistema','Monitoreo automático','Procesamos imágenes Sentinel-2 cada 30 días y calculamos el NDVI.'],['🏢','Empresa','Apadrinar árboles','La empresa elige el proyecto, paga y recibe su dashboard en tiempo real.'],['📄','Sistema','Certificado verificable','PDF con hash SHA-256 que prueba la restauración con evidencia satelital.']].map(([icon,who,title,desc])=>(
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

      <div style={{ background:'linear-gradient(135deg,#0d3d2e 0%,#1a5c42 100%)', padding:'60px 24px', textAlign:'center' }}>
        <div style={{ maxWidth:560, margin:'0 auto' }}>
          <div style={{ fontSize:40, marginBottom:16 }}>🛰️</div>
          <h2 style={{ fontSize:'clamp(22px,4vw,38px)', fontWeight:800, color:'#fff', marginBottom:16 }}>Tu restauración merece ser verificada</h2>
          <p style={{ fontSize:14, color:'rgba(255,255,255,0.75)', marginBottom:32, lineHeight:1.7 }}>Registrá tu proyecto en menos de 10 minutos. El primer reporte satelital es gratis.</p>
          <button onClick={() => setPage('onboarding')} style={{ background:'#1D9E75', color:'#fff', border:'none', borderRadius:10, padding:'14px 32px', fontSize:15, fontWeight:600, cursor:'pointer' }}>
            Registrar mi proyecto gratis →
          </button>
          <div style={{ marginTop:20, fontSize:12, color:'rgba(255,255,255,0.4)' }}>Sin tarjeta de crédito · Primer reporte gratuito</div>
        </div>
      </div>

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