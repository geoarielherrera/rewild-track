import { useEffect, useRef, useState } from 'react'

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
const LEAFLET_JS  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'

function loadLeaflet() {
  return new Promise(resolve => {
    if (window.L) { resolve(); return }
    const link = document.createElement('link')
    link.rel = 'stylesheet'; link.href = LEAFLET_CSS
    document.head.appendChild(link)
    const script = document.createElement('script')
    script.src = LEAFLET_JS
    script.onload = resolve
    document.head.appendChild(script)
  })
}

export default function SatelliteMap({ geojson, height = 320, showLabel = true }) {
  const containerRef = useRef(null)
  const mapRef       = useRef(null)
  const [ready, setReady] = useState(false)

  // Cargar Leaflet
  useEffect(() => {
    loadLeaflet().then(() => setReady(true))
  }, [])

  // Inicializar mapa cuando Leaflet esté listo y haya geojson
  useEffect(() => {
    if (!ready || !containerRef.current || !geojson) return

    const L = window.L

    // Destruir mapa anterior si existe
    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
    }

    // Calcular centro y bounds del polígono
    const coords  = geojson.coordinates[0]
    const lats    = coords.map(c => c[1])
    const lngs    = coords.map(c => c[0])
    const minLat  = Math.min(...lats), maxLat = Math.max(...lats)
    const minLng  = Math.min(...lngs), maxLng = Math.max(...lngs)
    const bounds  = [[minLat, minLng], [maxLat, maxLng]]

    // Crear mapa
    const map = L.map(containerRef.current, {
      zoomControl:       true,
      scrollWheelZoom:   false,
      attributionControl: true,
      dragging:          true,
    })

    // Capa satelital ESRI — alta resolución, sin API key, sin CORS
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: 'Tiles © Esri — Esri, DigitalGlobe, GeoEye, Earthstar Geographics',
        maxZoom: 19,
      }
    ).addTo(map)

    // Capa de etiquetas encima (calles y nombres)
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, opacity: 0.7 }
    ).addTo(map)

    // Dibujar polígono
    const polygon = L.polygon(
      coords.map(c => [c[1], c[0]]),
      {
        color:       '#1D9E75',
        weight:      2.5,
        opacity:     1,
        fillColor:   '#1D9E75',
        fillOpacity: 0.18,
      }
    ).addTo(map)

    // Ajustar vista al polígono con margen
    map.fitBounds(bounds, { padding: [30, 30] })

    mapRef.current = map

    // Fix de tamaño
    setTimeout(() => map.invalidateSize(), 100)

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [ready, geojson])

  if (!geojson) return null

  return (
    <div style={{ position: 'relative', width: '100%', borderRadius: 10, overflow: 'hidden', border: '0.5px solid #ddd' }}>
      <div
        ref={containerRef}
        style={{ height, width: '100%' }}
      />
      {showLabel && (
        <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 11, padding: '3px 8px', borderRadius: 6, zIndex: 1000, pointerEvents: 'none' }}>
          🛰️ Imagen satelital · ESRI World Imagery
        </div>
      )}
    </div>
  )
}