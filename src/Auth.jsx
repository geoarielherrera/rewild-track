import { useState } from 'react'
import { supabase } from './supabase'

export default function Auth({ onAuth }) {
  const [mode,     setMode]     = useState('login') // login | register | forgot
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [name,     setName]     = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')

  const inp = {
    width: '100%', padding: '10px 12px', border: '0.5px solid #ddd',
    borderRadius: 8, fontSize: 14, fontFamily: 'inherit',
    background: '#fff', boxSizing: 'border-box', marginBottom: 12,
  }

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true); setError('')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    onAuth(data.user)
  }

  async function handleRegister(e) {
    e.preventDefault()
    if (!name) { setError('Ingresá el nombre de tu organización.'); return }
    setLoading(true); setError('')
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { org_name: name } }
    })
    if (error) { setError(error.message); setLoading(false); return }
    setSuccess('¡Cuenta creada! Revisá tu email para confirmar y luego iniciá sesión.')
    setMode('login')
    setLoading(false)
  }

  async function handleForgot(e) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://rewild-track.vercel.app',
    })
    if (error) { setError(error.message); setLoading(false); return }
    setSuccess('Te enviamos un email para restablecer tu contraseña.')
    setLoading(false)
  }

  return (
    <div style={{ fontFamily:'-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif', minHeight:'100vh', background:'linear-gradient(160deg,#0d3d2e 0%,#1a5c42 60%,#2d8a60 100%)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'#fff', borderRadius:16, padding:'32px 28px', maxWidth:420, width:'100%', boxShadow:'0 8px 40px rgba(0,0,0,0.2)' }}>

        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ fontSize:36, marginBottom:8 }}>🌳</div>
          <div style={{ fontSize:20, fontWeight:700, color:'#0d3d2e' }}>ForestVerify</div>
          <div style={{ fontSize:12, color:'#888', marginTop:4 }}>
            {mode === 'login'    && 'Iniciá sesión en tu cuenta'}
            {mode === 'register' && 'Creá tu cuenta de ONG'}
            {mode === 'forgot'   && 'Recuperar contraseña'}
          </div>
        </div>

        {/* Mensajes */}
        {error   && <div style={{ background:'#FEF2F2', border:'0.5px solid #FECACA', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#991B1B', marginBottom:14 }}>{error}</div>}
        {success && <div style={{ background:'#EAF3DE', border:'0.5px solid #C0DD97', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#3B6D11', marginBottom:14 }}>{success}</div>}

        {/* Login */}
        {mode === 'login' && (
          <form onSubmit={handleLogin}>
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>Email</label>
            <input style={inp} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@email.com" required />

            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>Contraseña</label>
            <input style={inp} type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required />

            <button type="submit" disabled={loading} style={{ width:'100%', padding:'11px', background:'#1D9E75', color:'#fff', border:'none', borderRadius:9, fontSize:14, fontWeight:600, cursor:'pointer', marginBottom:12 }}>
              {loading ? 'Iniciando sesión…' : 'Iniciar sesión'}
            </button>

            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13 }}>
              <span style={{ color:'#1D9E75', cursor:'pointer' }} onClick={()=>{ setMode('forgot'); setError(''); setSuccess('') }}>
                ¿Olvidaste tu contraseña?
              </span>
              <span style={{ color:'#1D9E75', cursor:'pointer' }} onClick={()=>{ setMode('register'); setError(''); setSuccess('') }}>
                Crear cuenta
              </span>
            </div>
          </form>
        )}

        {/* Registro */}
        {mode === 'register' && (
          <form onSubmit={handleRegister}>
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>Nombre de tu ONG *</label>
            <input style={inp} value={name} onChange={e=>setName(e.target.value)} placeholder="Bosque Nativo Córdoba" required />

            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>Email *</label>
            <input style={inp} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@email.com" required />

            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>Contraseña *</label>
            <input style={inp} type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" required minLength={6} />

            <button type="submit" disabled={loading} style={{ width:'100%', padding:'11px', background:'#1D9E75', color:'#fff', border:'none', borderRadius:9, fontSize:14, fontWeight:600, cursor:'pointer', marginBottom:12 }}>
              {loading ? 'Creando cuenta…' : 'Crear cuenta'}
            </button>

            <div style={{ textAlign:'center', fontSize:13 }}>
              <span style={{ color:'#888' }}>¿Ya tenés cuenta? </span>
              <span style={{ color:'#1D9E75', cursor:'pointer' }} onClick={()=>{ setMode('login'); setError(''); setSuccess('') }}>
                Iniciá sesión
              </span>
            </div>
          </form>
        )}

        {/* Recuperar contraseña */}
        {mode === 'forgot' && (
          <form onSubmit={handleForgot}>
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>Email</label>
            <input style={inp} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@email.com" required />

            <button type="submit" disabled={loading} style={{ width:'100%', padding:'11px', background:'#1D9E75', color:'#fff', border:'none', borderRadius:9, fontSize:14, fontWeight:600, cursor:'pointer', marginBottom:12 }}>
              {loading ? 'Enviando…' : 'Enviar email de recuperación'}
            </button>

            <div style={{ textAlign:'center', fontSize:13 }}>
              <span style={{ color:'#1D9E75', cursor:'pointer' }} onClick={()=>{ setMode('login'); setError(''); setSuccess('') }}>
                ← Volver al login
              </span>
            </div>
          </form>
        )}

        {/* Divider */}
        <div style={{ borderTop:'0.5px solid #e8e8e4', marginTop:20, paddingTop:16, textAlign:'center' }}>
          <div style={{ fontSize:11, color:'#aaa' }}>
            ¿Querés ver un proyecto de ejemplo?
          </div>
          <button onClick={()=>onAuth(null)} style={{ marginTop:8, fontSize:12, color:'#1D9E75', background:'none', border:'none', cursor:'pointer', textDecoration:'underline' }}>
            Entrar como visitante (sin cuenta)
          </button>
        </div>
      </div>
    </div>
  )
}