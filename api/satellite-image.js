// api/satellite-image.js — CommonJS para Vercel Functions

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')

  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  const CLIENT_ID     = process.env.VITE_COPERNICUS_CLIENT_ID
  const CLIENT_SECRET = process.env.VITE_COPERNICUS_CLIENT_SECRET

  if (!CLIENT_ID || !CLIENT_SECRET) {
    res.status(500).json({ error: 'Credenciales no configuradas' }); return
  }

  try {
    // 1. Obtener token
    const tokenRes = await fetch(
      'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type:    'client_credentials',
          client_id:     CLIENT_ID,
          client_secret: CLIENT_SECRET,
        }).toString(),
      }
    )

    if (!tokenRes.ok) {
      const txt = await tokenRes.text()
      res.status(500).json({ error: `Token error ${tokenRes.status}: ${txt}` }); return
    }

    const tokenData = await tokenRes.json()
    const access_token = tokenData.access_token

    // 2. Parámetros WMS desde query string
    const { bbox, date, width = '600', height = '400' } = req.query

    if (!bbox || !date) {
      res.status(400).json({ error: 'Faltan parámetros bbox o date' }); return
    }

    const params = new URLSearchParams({
      SERVICE:     'WMS',
      REQUEST:     'GetMap',
      VERSION:     '1.3.0',
      LAYERS:      'TRUE-COLOR',
      STYLES:      '',
      FORMAT:      'image/jpeg',
      TRANSPARENT: 'false',
      WIDTH:       width,
      HEIGHT:      height,
      CRS:         'EPSG:4326',
      BBOX:        bbox,
      TIME:        date,
      MAXCC:       '30',
    })

    const wmsUrl = `https://sh.dataspace.copernicus.eu/wms/${CLIENT_ID}?${params.toString()}`

    // 3. Descargar imagen
    const imgRes = await fetch(wmsUrl, {
      headers: { Authorization: `Bearer ${access_token}` }
    })

    if (!imgRes.ok) {
      const txt = await imgRes.text()
      res.status(imgRes.status).json({ error: `WMS error: ${txt}` }); return
    }

    const contentType = imgRes.headers.get('content-type') || 'image/jpeg'

    // Verificar que es imagen y no un error XML
    if (contentType.includes('xml') || contentType.includes('text')) {
      const txt = await imgRes.text()
      res.status(500).json({ error: `WMS devolvió no-imagen: ${txt.slice(0, 300)}` }); return
    }

    // 4. Devolver imagen
    const buffer = await imgRes.arrayBuffer()
    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.status(200).send(Buffer.from(buffer))

  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}