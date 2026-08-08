import { useState, useEffect, useRef } from 'react'

function getBBox(geojson) {
  const coords = geojson.coordinates[0]
  const lngs = coords.map(c => c[0])
  const lats = coords.map(c => c[1])
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const dLng = (maxLng - minLng) * 0.25
  const dLat = (maxLat - minLat) * 0.25
  return {
    minLng: minLng - dLng, maxLng: maxLng + dLng,
    minLat: minLat - dLat, maxLat: maxLat + dLat,
  }
}

function drawPolygon(canvas, geojson, bbox) {
  const ctx = canvas.getContext('2d')
  const { minLng, maxLng, minLat, maxLat } = bbox
  const w = canvas.width, h = canvas.height

  function toPixel(lng, lat) {
    return {
      x: ((lng - minLng) / (maxLng - minLng)) * w,
      y: h - ((lat - minLat) / (maxLat - minLat)) * h,
    }
  }

  const coords = geojson.coordinates[0]

  ctx.beginPath()
  coords.forEach((c, i) => {
    const { x, y } = toPixel(c[0], c[1])
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  })
  ctx.closePath()
  ctx.fillStyle = 'rgba(29,158,117,0.18)'
  ctx.fill()
  ctx.strokeStyle = '#1D9E75'
  ctx.lineWidth = 2.5
  ctx.setLineDash([])
  ctx.stroke()

  coords.forEach((c, i) => {
    const { x, y } = toPixel(c[0], c[1])
    ctx.beginPath()
    ctx.arc(x, y, 5, 0, Math.PI * 2)
    ctx.fillStyle = i === 0 ? '#E24B4A' : '#1D9E75'
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.stroke()
  })
}

export default function SatelliteMap({ geojson, date, width = 600, height = 400 }) {
  const canvasRef = useRef(null)
  const [status, setStatus] = useState('loading')
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    if (!geojson) return
    setStatus('loading')

    async function load() {
      try {
        const bbox    = getBBox(geojson)
        const imgDate = date ? date.slice(0, 10) : new Date().toISOString().slice(0, 10)
        const bboxStr = `${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng}`

        // Usa el proxy de Vercel — evita CORS
        const imgUrl = `/api/satellite-image.cjs?bbox=${encodeURIComponent(bboxStr)}&date=${imgDate}&width=${width}&height=${height}`

        const img = new Image()
        img.onload = () => {
          const canvas = canvasRef.current
          if (!canvas) return
          canvas.width  = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, width, height)
          drawPolygon(canvas, geojson, bbox)
          setStatus('ready')
        }
        img.onerror = () => {
          setErrMsg('No se pudo cargar la imagen satelital.')
          setStatus('error')
        }
        img.src = imgUrl
      } catch (e) {
        setErrMsg(e.message)
        setStatus('error')
      }
    }

    load()
  }, [geojson, date])

  if (!geojson) return null

  return (
    <div style={{ position: 'relative', width: '100%', borderRadius: 10, overflow: 'hidden', border: '0.5px solid #ddd', background: '#1a2a1a', minHeight: height }}>
      {status === 'loading' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, zIndex: 10 }}>
          <div style={{ width: 32, height: 32, border: '3px solid #1D9E75', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Cargando imagen Sentinel-2…</span>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}
      {status === 'error' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span style={{ fontSize: 28 }}>🛰️</span>
          <span style={{ fontSize: 12, color: '#E24B4A', textAlign: 'center', maxWidth: 280, padding: '0 16px' }}>{errMsg}</span>
        </div>
      )}
      <canvas
        ref={canvasRef}
        style={{ display: status === 'ready' ? 'block' : 'none', width: '100%', height: 'auto' }}
      />
      {status === 'ready' && (
        <div style={{ position: 'absolute', bottom: 6, right: 8, fontSize: 10, color: 'rgba(255,255,255,0.7)', background: 'rgba(0,0,0,0.4)', padding: '2px 6px', borderRadius: 4 }}>
          © Copernicus / ESA · Sentinel-2
        </div>
      )}
    </div>
  )
}