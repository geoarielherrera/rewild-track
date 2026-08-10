import { useState, useRef } from 'react'
import { supabase } from './supabase'

const STEPS = ['Organización', 'Proyecto', 'Polígono', 'Árboles', 'Confirmación']
const SPECIES_OPTIONS = ['Molle de beber','Tala','Espinillo','Quebracho blanco','Quebracho colorado','Algarrobo blanco','Algarrobo negro','Ceibo','Lapacho','Mistol','Piquillín','Brea','Chañar','Coco','Otra nativa']
const BIOME_OPTIONS = ['Bosque chaqueño serrano','Bosque ribereño','Monte arbustivo','Pastizal de altura','Espinal','Otro']
const VERIF_FREQ = ['Mensual','Trimestral','Semestral','Anual']
const UNQUILLO = { lat: -31.2333, lng: -64.3167 }

const inp = { width:'100%', padding:'8px 10px', border:'0.5px solid #ddd', borderRadius:8, fontSize:13, fontFamily:'inherit', background:'#fff', boxSizing:'border-box' }

function Field({ label, hint, required, children }) {
  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>
        {label}{required && <span style={{ color:'#E24B4A' }}> *</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize:11, color:'#aaa', marginTop:3 }}>{hint}</div>}
    </div>
  )
}

// ── Mapa Canvas ───────────────────────────────────────────────
function TileMap({ onPolygonChange }) {
  const canvasRef  = useRef(null)
  const tilesRef   = useRef({})
  const viewRef    = useRef({ lat: UNQUILLO.lat, lng: UNQUILLO.lng, zoom: 14 })
  const dragRef    = useRef(null)
  const pointsRef  = useRef([])
  const closedRef  = useRef(false)
  const isDragging = useRef(false)
  const [info, setInfo]     = useState('Hacé clic para agregar puntos · Usá el botón para cerrar el polígono')
  const [area, setArea]     = useState(null)
  const [mode, setMode]     = useState('draw')
  const [coords, setCoords] = useState('')
  const [, forceUpdate]     = useState(0)

  function latLngToPixel(lat, lng, view, w, h) {
    const z = view.zoom, n = Math.pow(2, z)
    const xT = (lng + 180) / 360 * n
    const latR = lat * Math.PI / 180
    const yT = (1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2 * n
    const cx = (view.lng + 180) / 360 * n
    const latRc = view.lat * Math.PI / 180
    const cy = (1 - Math.log(Math.tan(latRc) + 1 / Math.cos(latRc)) / Math.PI) / 2 * n
    return { x: (xT - cx) * 256 + w / 2, y: (yT - cy) * 256 + h / 2 }
  }

  function pixelToLatLng(px, py, view, w, h) {
    const z = view.zoom, n = Math.pow(2, z)
    const cx = (view.lng + 180) / 360 * n
    const latRc = view.lat * Math.PI / 180
    const cy = (1 - Math.log(Math.tan(latRc) + 1 / Math.cos(latRc)) / Math.PI) / 2 * n
    const xT = (px - w / 2) / 256 + cx
    const yT = (py - h / 2) / 256 + cy
    const lng = xT / n * 360 - 180
    const latR = Math.atan(Math.sinh(Math.PI * (1 - 2 * yT / n)))
    return { lat: latR * 180 / Math.PI, lng }
  }

  function loadTile(x, y, z, cb) {
    const key = `${z}/${x}/${y}`
    if (tilesRef.current[key]) { cb(tilesRef.current[key]); return }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const sub = ['a','b','c'][(x + y) % 3]
    img.src = `https://${sub}.tile.openstreetmap.org/${z}/${x}/${y}.png`
    img.onload  = () => { tilesRef.current[key] = img; cb(img) }
    img.onerror = () => { tilesRef.current[key] = null; cb(null) }
  }

  function draw() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const w = canvas.width, h = canvas.height
    const view = viewRef.current
    const z = view.zoom, n = Math.pow(2, z)
    ctx.fillStyle = '#e8e0d8'
    ctx.fillRect(0, 0, w, h)
    const cx = (view.lng + 180) / 360 * n
    const latRc = view.lat * Math.PI / 180
    const cy = (1 - Math.log(Math.tan(latRc) + 1 / Math.cos(latRc)) / Math.PI) / 2 * n
    const tx0 = Math.floor(cx - w/2/256), ty0 = Math.floor(cy - h/2/256)
    const tx1 = Math.ceil(cx + w/2/256),  ty1 = Math.ceil(cy + h/2/256)
    for (let tx = tx0; tx <= tx1; tx++) {
      for (let ty = ty0; ty <= ty1; ty++) {
        const px = (tx - cx) * 256 + w/2
        const py = (ty - cy) * 256 + h/2
        const key = `${z}/${tx}/${ty}`
        const cached = tilesRef.current[key]
        if (cached) { ctx.drawImage(cached, Math.round(px), Math.round(py), 256, 256) }
        else if (cached === undefined) {
          tilesRef.current[key] = null
          loadTile(tx, ty, z, img => { if (img) requestAnimationFrame(draw) })
          ctx.fillStyle = '#ddd8d0'
          ctx.fillRect(Math.round(px), Math.round(py), 256, 256)
        }
      }
    }
    const pts = pointsRef.current
    if (pts.length > 0) {
      if (closedRef.current) {
        ctx.beginPath()
        pts.forEach((p, i) => { const {x,y} = latLngToPixel(p.lat,p.lng,view,w,h); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y) })
        ctx.closePath()
        ctx.fillStyle = 'rgba(29,158,117,0.18)'; ctx.fill()
        ctx.strokeStyle = '#1D9E75'; ctx.lineWidth = 2; ctx.stroke()
      } else {
        ctx.beginPath()
        pts.forEach((p, i) => { const {x,y} = latLngToPixel(p.lat,p.lng,view,w,h); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y) })
        ctx.strokeStyle = '#1D9E75'; ctx.lineWidth = 2; ctx.setLineDash([6,4]); ctx.stroke(); ctx.setLineDash([])
      }
      pts.forEach((p, i) => {
        const {x,y} = latLngToPixel(p.lat,p.lng,view,w,h)
        ctx.beginPath(); ctx.arc(x,y,5,0,Math.PI*2)
        ctx.fillStyle = i===0?'#E24B4A':'#1D9E75'; ctx.fill()
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke()
      })
    }
    // Atribución
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(0,h-18,165,18)
    ctx.fillStyle = '#666'; ctx.font = '10px sans-serif'; ctx.fillText('© OpenStreetMap contributors',4,h-5)
    // Botones zoom
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(8,8,28,60)
    ctx.fillStyle = '#444'; ctx.font = 'bold 16px sans-serif'; ctx.fillText('+',14,30)
    ctx.fillStyle = '#ccc'; ctx.fillRect(12,36,20,1)
    ctx.fillStyle = '#444'; ctx.fillText('−',15,58)
  }

  function calcAreaHa(pts) {
    if (pts.length < 3) return 0
    const R = 6371000; let a = 0
    for (let i = 0; i < pts.length; i++) {
      const j = (i+1)%pts.length
      const la1=pts[i].lat*Math.PI/180, la2=pts[j].lat*Math.PI/180
      const lo1=pts[i].lng*Math.PI/180, lo2=pts[j].lng*Math.PI/180
      a += (lo2-lo1)*(2+Math.sin(la1)+Math.sin(la2))
    }
    return Math.abs(a*R*R/2)/10000
  }

  function closePolygon() {
    if (pointsRef.current.length < 3) return
    closedRef.current = true
    const ha = calcAreaHa(pointsRef.current)
    setArea(ha.toFixed(2))
    setInfo(`✓ Polígono cerrado · ${ha.toFixed(2)} ha · ${pointsRef.current.length} vértices`)
    const geojson = {
      type: 'Polygon',
      coordinates: [[...pointsRef.current.map(p=>[p.lng,p.lat]), [pointsRef.current[0].lng,pointsRef.current[0].lat]]]
    }
    onPolygonChange(geojson, ha.toFixed(2))
    forceUpdate(n=>n+1)
    draw()
  }

  function reset() {
    pointsRef.current = []; closedRef.current = false
    setArea(null)
    setInfo('Hacé clic para agregar puntos · Usá el botón para cerrar el polígono')
    onPolygonChange(null, null)
    forceUpdate(n=>n+1)
    draw()
  }

  function initCanvas(el) {
    if (!el || canvasRef.current) return
    canvasRef.current = el
    el.width = el.offsetWidth; el.height = el.offsetHeight
    draw()
  }

  function handleMouseDown(e) {
    isDragging.current = false
    dragRef.current = { x: e.clientX, y: e.clientY, lat: viewRef.current.lat, lng: viewRef.current.lng }
  }

  function handleMouseMove(e) {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.x
    const dy = e.clientY - dragRef.current.y
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) isDragging.current = true
    const z = viewRef.current.zoom, n = Math.pow(2,z)
    const latR = dragRef.current.lat * Math.PI/180
    viewRef.current = { zoom:z, lat:dragRef.current.lat+dy/256/n*360*Math.cos(latR)*0.8, lng:dragRef.current.lng-dx/256/n*360 }
    draw()
  }

  function handleMouseUp() { dragRef.current = null }

  function handleClick(e) {
    // Si fue un drag, ignorar
    if (isDragging.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const w  = canvasRef.current.width
    const h  = canvasRef.current.height

    // Botones zoom
    if (px >= 8 && px <= 36) {
      if (py >= 8  && py <= 36) { viewRef.current = { ...viewRef.current, zoom: Math.min(18, viewRef.current.zoom+1) }; tilesRef.current = {}; draw(); return }
      if (py >= 38 && py <= 66) { viewRef.current = { ...viewRef.current, zoom: Math.max(8,  viewRef.current.zoom-1) }; tilesRef.current = {}; draw(); return }
    }

    if (closedRef.current) return

    const ll = pixelToLatLng(px, py, viewRef.current, w, h)
    pointsRef.current.push(ll)
    const n = pointsRef.current.length
    setInfo(n < 3
      ? `${n} punto${n>1?'s':''} · Necesitás al menos 3`
      : `${n} puntos · Presioná "Cerrar polígono" cuando termines`)
    forceUpdate(x=>x+1)
    draw()
  }

  function handleWheel(e) {
    e.preventDefault()
    viewRef.current = { ...viewRef.current, zoom: Math.min(18, Math.max(8, viewRef.current.zoom+(e.deltaY>0?-1:1))) }
    tilesRef.current = {}; draw()
  }

  function loadCoords() {
    try {
      const pts = coords.trim().split('\n').filter(Boolean).map(l => {
        const [a,b] = l.split(/[\s,;]+/).map(Number)
        if (isNaN(a)||isNaN(b)) throw new Error()
        return { lat:a, lng:b }
      })
      if (pts.length < 3) { alert('Necesitás al menos 3 puntos.'); return }
      reset()
      pointsRef.current = pts; closedRef.current = true
      const avg = pts.reduce((s,p)=>({lat:s.lat+p.lat/pts.length,lng:s.lng+p.lng/pts.length}),{lat:0,lng:0})
      viewRef.current = { lat:avg.lat, lng:avg.lng, zoom:15 }
      tilesRef.current = {}
      const ha = calcAreaHa(pts)
      setArea(ha.toFixed(2))
      setInfo(`✓ Polígono cargado · ${ha.toFixed(2)} ha`)
      const geojson = { type:'Polygon', coordinates:[[...pts.map(p=>[p.lng,p.lat]),[pts[0].lng,pts[0].lat]]] }
      onPolygonChange(geojson, ha.toFixed(2))
      forceUpdate(n=>n+1)
      draw()
    } catch { alert('Formato inválido. Usá: lat, lng por línea.') }
  }

  const showCloseBtn = !closedRef.current && pointsRef.current.length >= 3

  return (
    <div>
      <div style={{ display:'flex', gap:6, marginBottom:8 }}>
        {[['draw','🖱 Dibujar'],['coords','📋 Pegar coordenadas']].map(([k,l])=>(
          <button key={k} onClick={()=>setMode(k)} style={{ fontSize:12, padding:'6px 14px', borderRadius:8, border:'0.5px solid', borderColor:mode===k?'#1D9E75':'#ddd', background:mode===k?'#EAF3DE':'#fff', color:mode===k?'#1D9E75':'#666', cursor:'pointer' }}>{l}</button>
        ))}
      </div>
      {mode === 'coords' && (
        <div style={{ marginBottom:10 }}>
          <textarea value={coords} onChange={e=>setCoords(e.target.value)}
            placeholder={'-31.225, -64.340\n-31.225, -64.330\n-31.235, -64.330'}
            style={{ width:'100%', height:80, fontSize:12, fontFamily:'monospace', padding:'8px', border:'0.5px solid #ddd', borderRadius:8, resize:'vertical', boxSizing:'border-box' }} />
          <button onClick={loadCoords} style={{ fontSize:12, padding:'6px 16px', background:'#1D9E75', color:'white', border:'none', borderRadius:8, cursor:'pointer', marginTop:6 }}>Cargar polígono</button>
        </div>
      )}
      <div style={{ fontSize:12, color:'#555', background:'#f0f7f4', border:'0.5px solid #c8e6d8', borderRadius:8, padding:'7px 12px', marginBottom:6 }}>💡 {info}</div>
      <div style={{ width:'100%', height:340, borderRadius:10, border:'0.5px solid #ddd', overflow:'hidden', cursor:'crosshair' }}>
        <canvas ref={initCanvas} style={{ width:'100%', height:'100%', display:'block' }}
          onClick={handleClick}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel} />
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:8, gap:8 }}>
        <div>
          {area
            ? <span style={{ fontSize:13, color:'#1D9E75', fontWeight:500 }}>✓ Área: <b>{area} ha</b></span>
            : <span style={{ fontSize:12, color:'#aaa' }}>Sin polígono definido</span>
          }
        </div>
        <div style={{ display:'flex', gap:6 }}>
          {showCloseBtn && (
            <button onClick={closePolygon} style={{ fontSize:12, padding:'6px 14px', borderRadius:8, border:'0.5px solid #1D9E75', background:'#EAF3DE', color:'#1D9E75', cursor:'pointer', fontWeight:500 }}>
              ✓ Cerrar polígono
            </button>
          )}
          {(area || pointsRef.current.length > 0) && (
            <button onClick={reset} style={{ fontSize:11, padding:'4px 12px', borderRadius:6, border:'0.5px solid #ddd', background:'#fff', cursor:'pointer', color:'#888' }}>Reiniciar</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Pasos ─────────────────────────────────────────────────────
function StepOrg({ data, onChange }) {
  const f = (k,v) => onChange({...data,[k]:v})
  return (
    <div>
      <p style={{ fontSize:13, color:'#666', marginBottom:16 }}>Datos de tu organización.</p>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        <Field label="Nombre de la ONG" required><input style={inp} value={data.ong_name||''} onChange={e=>f('ong_name',e.target.value)} placeholder="Bosque Nativo Córdoba" /></Field>
        <Field label="País / Provincia" required><input style={inp} value={data.country||''} onChange={e=>f('country',e.target.value)} placeholder="Argentina — Córdoba" /></Field>
      </div>
      <Field label="Sitio web"><input style={inp} value={data.website||''} onChange={e=>f('website',e.target.value)} placeholder="https://..." /></Field>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        <Field label="Responsable" required><input style={inp} value={data.contact_name||''} onChange={e=>f('contact_name',e.target.value)} /></Field>
        <Field label="Email" required><input style={inp} type="email" value={data.contact_email||''} onChange={e=>f('contact_email',e.target.value)} /></Field>
      </div>
      <Field label="Descripción"><textarea style={{ ...inp, resize:'vertical' }} rows={3} value={data.ong_desc||''} onChange={e=>f('ong_desc',e.target.value)} placeholder="Misión, años de trabajo, área geográfica..." /></Field>
      <Field label="¿Tienen personería jurídica?">
        <div style={{ display:'flex', gap:14, marginTop:4 }}>
          {['Sí','En trámite','No'].map(opt=>(
            <label key={opt} style={{ fontSize:13, display:'flex', alignItems:'center', gap:5, cursor:'pointer' }}>
              <input type="radio" name="legal" checked={data.legal===opt} onChange={()=>f('legal',opt)} style={{ width:'auto' }} /> {opt}
            </label>
          ))}
        </div>
      </Field>
    </div>
  )
}

function StepProject({ data, onChange }) {
  const f = (k,v) => onChange({...data,[k]:v})
  return (
    <div>
      <p style={{ fontSize:13, color:'#666', marginBottom:16 }}>Describí el proyecto de restauración.</p>
      <Field label="Nombre del proyecto" required><input style={inp} value={data.project_name||''} onChange={e=>f('project_name',e.target.value)} placeholder="Restauración Quebrada del Tigre" /></Field>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        <Field label="Localidad" required><input style={inp} value={data.location||''} onChange={e=>f('location',e.target.value)} placeholder="Unquillo, Córdoba" /></Field>
        <Field label="Bioma" required>
          <select style={inp} value={data.biome||''} onChange={e=>f('biome',e.target.value)}>
            <option value="">Seleccionar…</option>
            {BIOME_OPTIONS.map(b=><option key={b}>{b}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        <Field label="Fecha de plantación" required><input style={inp} type="date" value={data.planting_date||''} onChange={e=>f('planting_date',e.target.value)} /></Field>
        <Field label="Verificación satelital">
          <select style={inp} value={data.verif_freq||'Mensual'} onChange={e=>f('verif_freq',e.target.value)}>
            {VERIF_FREQ.map(v=><option key={v}>{v}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Descripción" required><textarea style={{ ...inp, resize:'vertical' }} rows={3} value={data.description||''} onChange={e=>f('description',e.target.value)} placeholder="Contexto, objetivos, comunidades..." /></Field>
    </div>
  )
}

function StepPolygon({ data, onChange }) {
  return (
    <div>
      <p style={{ fontSize:13, color:'#666', marginBottom:14 }}>Delimitá el área de restauración. El sistema la monitoreará automáticamente con Sentinel-2.</p>
      <TileMap onPolygonChange={(poly,area)=>onChange({...data,polygon:poly,area_ha:area})} />
      {data.area_ha && (
        <div style={{ marginTop:10, background:'#EAF3DE', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#3B6D11' }}>
          <b>Área: {data.area_ha} ha</b> — ~{Math.round(data.area_ha*10000/100)} píxeles Sentinel-2 por imagen.
        </div>
      )}
    </div>
  )
}

function StepTrees({ data, onChange }) {
  const f = (k,v) => onChange({...data,[k]:v})
  return (
    <div>
      <p style={{ fontSize:13, color:'#666', marginBottom:16 }}>Datos de la plantación.</p>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        <Field label="Cantidad de árboles" required><input style={inp} type="number" value={data.trees_planted||''} onChange={e=>f('trees_planted',e.target.value)} /></Field>
        <Field label="Densidad (calculada)"><input style={{ ...inp, background:'#f9f9f7' }} readOnly value={data.area_ha&&data.trees_planted?`${(data.trees_planted/data.area_ha).toFixed(0)} árb/ha`:'Requiere polígono'} /></Field>
      </div>
      <Field label="Especies" required>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:4 }}>
          {SPECIES_OPTIONS.map(s=>(
            <label key={s} style={{ fontSize:12, display:'flex', alignItems:'center', gap:4, cursor:'pointer', background:(data.species||[]).includes(s)?'#EAF3DE':'#f9f9f7', border:`0.5px solid ${(data.species||[]).includes(s)?'#1D9E75':'#ddd'}`, borderRadius:6, padding:'4px 10px' }}>
              <input type="checkbox" checked={(data.species||[]).includes(s)} onChange={e=>f('species',e.target.checked?[...(data.species||[]),s]:(data.species||[]).filter(x=>x!==s))} style={{ width:'auto' }} /> {s}
            </label>
          ))}
        </div>
      </Field>
      <Field label="Método de plantación">
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginTop:4 }}>
          {['Plantines en maceta','Siembra directa','Regeneración asistida','Mixto'].map(opt=>(
            <label key={opt} style={{ fontSize:13, display:'flex', alignItems:'center', gap:5, cursor:'pointer' }}>
              <input type="radio" name="method" checked={data.method===opt} onChange={()=>f('method',opt)} style={{ width:'auto' }} /> {opt}
            </label>
          ))}
        </div>
      </Field>
    </div>
  )
}

function StepConfirm({ data, onSuccess }) {
  const [agreed, setAgreed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pid, setPid]       = useState(null)
  const [error, setError]   = useState('')

  async function submit() {
    if (!agreed) { alert('Aceptá los términos para continuar.'); return }
    setSaving(true); setError('')
    try {
      const projectId = `PROJ-${new Date().getFullYear()}-${String(Math.floor(Math.random()*900)+100)}`

      // Guardar organización
      const { data: orgData, error: orgErr } = await supabase
        .from('organizations')
        .insert([{
          name:          data.ong_name,
          country:       data.country,
          contact_name:  data.contact_name,
          contact_email: data.contact_email,
          website:       data.website,
          legal_status:  data.legal,
          description:   data.ong_desc,
        }])
        .select()
      if (orgErr) throw orgErr
      const org = orgData[0]

      // Guardar proyecto — incluye el polígono como GeoJSON
      const projectPayload = {
        id:            projectId,
        ong_id:        org.id,
        name:          data.project_name,
        location_name: data.location,
        biome:         data.biome,
        planting_date: data.planting_date,
        trees_planted: +data.trees_planted,
        area_ha:       +data.area_ha,
        species:       data.species,
        method:        data.method,
        verif_freq:    data.verif_freq,
        description:   data.description,
      }

      // Agregar polígono si existe — usar ST_GeomFromGeoJSON via RPC
      const { error: projErr } = await supabase
        .from('projects')
        .insert([projectPayload])
      if (projErr) throw projErr

      // Guardar polígono por separado con SQL si existe
      if (data.polygon) {
        await supabase.rpc('set_project_polygon', {
          project_id:   projectId,
          geojson_text: JSON.stringify(data.polygon),
        })
      }

      setPid(projectId)
      if (onSuccess) onSuccess(projectId)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (pid) return (
    <div style={{ textAlign:'center', padding:'30px 10px' }}>
      <div style={{ fontSize:52, marginBottom:14 }}>🌱</div>
      <div style={{ fontSize:18, fontWeight:600, marginBottom:8 }}>¡Proyecto registrado!</div>
      <div style={{ fontSize:13, color:'#666', marginBottom:20 }}>El sistema comenzará a monitorear el área con Sentinel-2.</div>
      <div style={{ background:'#EAF3DE', borderRadius:12, padding:'14px 28px', display:'inline-block', marginBottom:14 }}>
        <div style={{ fontSize:11, color:'#5a9e2f', marginBottom:4 }}>ID DE PROYECTO</div>
        <div style={{ fontFamily:'monospace', fontSize:18, fontWeight:700, color:'#27500A' }}>{pid}</div>
      </div>
      <div style={{ fontSize:12, color:'#888' }}>Guardá este ID — lo necesitás para acceder al dashboard.</div>
    </div>
  )

  return (
    <div>
      <p style={{ fontSize:13, color:'#666', marginBottom:16 }}>Revisá los datos antes de registrar.</p>
      {[
        ['Organización',[['ONG',data.ong_name],['Responsable',data.contact_name],['Email',data.contact_email]]],
        ['Proyecto',[['Nombre',data.project_name],['Localidad',data.location],['Plantación',data.planting_date]]],
        ['Plantación',[['Árboles',data.trees_planted],['Área',data.area_ha?`${data.area_ha} ha`:'—'],['Especies',(data.species||[]).slice(0,3).join(', ')]]],
      ].map(([title,fields])=>(
        <div key={title} style={{ background:'#f9f9f7', borderRadius:10, padding:'12px 14px', marginBottom:10 }}>
          <div style={{ fontSize:11, fontWeight:500, color:'#888', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>{title}</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
            {fields.filter(([,v])=>v).map(([l,v])=>(
              <div key={l}>
                <div style={{ fontSize:10, color:'#aaa' }}>{l}</div>
                <div style={{ fontSize:12, fontWeight:500 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div style={{ background:'#f9f9f7', borderRadius:10, padding:'12px 14px', marginBottom:14 }}>
        <div style={{ fontSize:11, fontWeight:500, color:'#888', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>Polígono</div>
        {data.polygon
          ? <div style={{ fontSize:12, color:'#1D9E75' }}>✓ Definido · {data.area_ha} ha</div>
          : <div style={{ fontSize:12, color:'#E24B4A' }}>⚠ Sin polígono — volvé al paso anterior</div>
        }
      </div>
      {error && (
        <div style={{ background:'#FEF2F2', border:'0.5px solid #FECACA', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#991B1B', marginBottom:14 }}>
          {error}
        </div>
      )}
      <label style={{ fontSize:13, display:'flex', alignItems:'flex-start', gap:8, cursor:'pointer', marginBottom:16 }}>
        <input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)} style={{ marginTop:2, width:'auto' }} />
        <span>Acepto los términos del servicio y confirmo que los datos son correctos.</span>
      </label>
      <button onClick={submit} disabled={saving} style={{ width:'100%', padding:'12px', background:agreed?'#1D9E75':'#bbb', color:'white', border:'none', borderRadius:10, fontSize:14, fontWeight:500, cursor:agreed?'pointer':'not-allowed' }}>
        {saving ? 'Guardando…' : 'Registrar proyecto y activar monitoreo 🛰️'}
      </button>
    </div>
  )
}

// ── App Onboarding ────────────────────────────────────────────
export default function Onboarding({ onSuccess }) {
  const [step, setStep] = useState(0)
  const [data, setData] = useState({})

  const canNext = [
    () => data.ong_name && data.contact_name && data.contact_email,
    () => data.project_name && data.planting_date && data.location,
    () => !!data.polygon,
    () => data.trees_planted && (data.species||[]).length > 0,
    () => true,
  ]

  const views = [
    <StepOrg     data={data} onChange={setData} />,
    <StepProject data={data} onChange={setData} />,
    <StepPolygon data={data} onChange={setData} />,
    <StepTrees   data={data} onChange={setData} />,
    <StepConfirm data={data} onSuccess={onSuccess} />,
  ]

  return (
    <div style={{ fontFamily:'-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif', background:'#f5f5f2', minHeight:'100vh', paddingBottom:40 }}>
      <div style={{ background:'#fff', borderBottom:'0.5px solid #e8e8e4', padding:'14px 20px', display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ fontSize:22 }}>🌳</span>
        <div>
          <div style={{ fontSize:15, fontWeight:600 }}>Registrar proyecto de restauración</div>
          <div style={{ fontSize:11, color:'#888' }}>Plataforma ForestVerify · Paso {step+1} de {STEPS.length}</div>
        </div>
      </div>

      <div style={{ background:'#fff', padding:'14px 20px 10px', borderBottom:'0.5px solid #e8e8e4' }}>
        <div style={{ display:'flex', position:'relative' }}>
          <div style={{ position:'absolute', top:13, left:'5%', right:'5%', height:2, background:'#e8e8e4', zIndex:0 }} />
          <div style={{ position:'absolute', top:13, left:'5%', height:2, background:'#1D9E75', zIndex:0, width:`${(step/(STEPS.length-1))*90}%`, transition:'width 0.3s' }} />
          {STEPS.map((s,i)=>(
            <div key={s} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', zIndex:1 }}>
              <div style={{ width:26, height:26, borderRadius:'50%', background:i<=step?'#1D9E75':'#fff', border:`2px solid ${i<=step?'#1D9E75':'#ddd'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, color:i<=step?'#fff':'#aaa', transition:'all 0.3s' }}>
                {i<step?'✓':i+1}
              </div>
              <div style={{ fontSize:10, color:i===step?'#1D9E75':'#aaa', marginTop:4, fontWeight:i===step?500:400, textAlign:'center' }}>{s}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ maxWidth:700, margin:'20px auto', padding:'0 16px' }}>
        <div style={{ background:'#fff', border:'0.5px solid #e8e8e4', borderRadius:14, padding:'20px 24px' }}>
          <h3 style={{ fontSize:16, fontWeight:600, marginTop:0, marginBottom:4 }}>{STEPS[step]}</h3>
          <div style={{ borderBottom:'0.5px solid #f0f0ec', marginBottom:18 }} />
          {views[step]}
        </div>
        {step < STEPS.length-1 && (
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:14 }}>
            <button onClick={()=>setStep(s=>s-1)} disabled={step===0} style={{ padding:'9px 22px', borderRadius:8, border:'0.5px solid #ddd', background:'#fff', fontSize:13, cursor:step===0?'not-allowed':'pointer', color:step===0?'#ccc':'#555' }}>← Anterior</button>
            <button onClick={()=>{ if(canNext[step]()) setStep(s=>s+1); else alert('Completá los campos obligatorios (*).')}} style={{ padding:'9px 24px', borderRadius:8, border:'none', background:'#1D9E75', color:'white', fontSize:13, fontWeight:500, cursor:'pointer' }}>Siguiente →</button>
          </div>
        )}
      </div>
    </div>
  )
}