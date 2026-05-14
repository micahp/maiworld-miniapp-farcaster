import type { VercelRequest, VercelResponse } from '@vercel/node'

// Serverless proxy for the MaiWorld mini-app.
// Two modes:
//   GET /api/proxy?target=<url>  — proxies a third-party resource (CORS-safe)
//   GET /api/proxy/releases       — returns structured Catalog release data
//
// Deploy on Vercel: the `api/` directory is auto-detected as serverless functions.

const CATALOG_URL = 'https://catalog.works/mai?tab=releases'

async function fetchCatalogReleases(): Promise<{ tokenId?: number; title?: string }[]> {
  const res = await fetch(CATALOG_URL, { redirect: 'follow' })
  if (!res.ok) throw new Error(`Catalog fetch failed: ${res.status}`)
  const html = await res.text()

  // Parse release titles from Catalog page markup
  const entries: { title: string }[] = []
  // Look for known patterns in Catalog's DOM
  const titleRx = /Artwork for ([\s\S]*?) by MAi/g
  let m
  while ((m = titleRx.exec(html)) !== null) {
    const title = m[1].trim()
    if (title) entries.push({ title })
  }

  // Also try extracting from link hrefs containing /mai/ which often carry titles
  const linkRx = /href="\/mai\/([^"]+)"/g
  while ((m = linkRx.exec(html)) !== null) {
    const slug = m[1].trim()
    // Convert slug to title guess (e.g. "artwork-name" → "Artwork Name")
    const titleGuess = slug
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
    if (titleGuess && !entries.some((e) => e.title === titleGuess)) {
      entries.push({ title: titleGuess })
    }
  }

  return entries
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers for mini-app
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  const path = req.url ? new URL(req.url, 'http://localhost').pathname : '/'

  // ── /api/proxy/releases — structured catalog data ────────────────────
  if (path.endsWith('/releases')) {
    try {
      const releases = await fetchCatalogReleases()
      return res.status(200).json({ releases, cachedAt: new Date().toISOString() })
    } catch (err: any) {
      return res.status(500).json({ error: String(err?.message || err) })
    }
  }

  // ── /api/proxy?target=<url> — generic proxy ─────────────────────────
  const target = (req.query.target as string) || req.query.url || ''
  if (!target) {
    return res.status(400).json({ error: 'missing target parameter' })
  }

  try {
    const url = new URL(target)
    const allowedHosts = ['catalog.works', 'arweave.net', 'dweb.link', 'ipfs.io']
    if (!allowedHosts.some((h) => url.hostname.endsWith(h))) {
      return res.status(403).json({ error: `host not allowed: ${url.hostname}` })
    }

    const fetchRes = await fetch(url.toString(), { redirect: 'follow' })
    const body = await fetchRes.arrayBuffer()
    res.setHeader('Content-Type', fetchRes.headers.get('content-type') || 'text/plain')
    res.status(fetchRes.status)
    res.send(Buffer.from(body))
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) })
  }
}
