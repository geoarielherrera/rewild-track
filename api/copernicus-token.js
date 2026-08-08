// api/copernicus-token.js
// Vercel Serverless Function — obtiene token de Copernicus sin CORS

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'POST')    { res.status(405).json({ error: 'Method not allowed' }); return }

  const CLIENT_ID     = process.env.VITE_COPERNICUS_CLIENT_ID
  const CLIENT_SECRET = process.env.VITE_COPERNICUS_CLIENT_SECRET

  if (!CLIENT_ID || !CLIENT_SECRET) {
    res.status(500).json({ error: 'Credenciales no configuradas' }); return
  }

  try {
    const response = await fetch(
      'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type:    'client_credentials',
          client_id:     CLIENT_ID,
          client_secret: CLIENT_SECRET,
        }),
      }
    )

    if (!response.ok) {
      const txt = await response.text()
      res.status(response.status).json({ error: txt }); return
    }

    const data = await response.json()
    res.status(200).json({
      access_token: data.access_token,
      expires_in:   data.expires_in,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}