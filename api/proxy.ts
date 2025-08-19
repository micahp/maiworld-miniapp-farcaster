import type { VercelRequest, VercelResponse } from '@vercel/node'

// Simple serverless proxy for fetching third-party resources with CORS headers.
// Deploy on Vercel / Netlify (adjust accordingly). Only allow catalog.works to
// reduce open-proxy risk.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const target = (req.query.target as string) || req.query.url || ''
  if (!target) return res.status(400).send('missing target')

  try {
    const url = new URL(target)
    const allowedHost = 'catalog.works'
    if (!url.hostname.endsWith(allowedHost)) {
      return res.status(403).send('host not allowed')
    }

    const fetchRes = await fetch(url.toString(), { redirect: 'follow' })
    const body = await fetchRes.arrayBuffer()
    // set permissive CORS for the Mini App host
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Content-Type', fetchRes.headers.get('content-type') || 'text/plain')
    res.status(fetchRes.status)
    res.send(Buffer.from(body))
  } catch (err: any) {
    res.status(500).send(String(err?.message || err))
  }
}


