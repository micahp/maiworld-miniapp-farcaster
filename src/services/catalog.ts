const CATALOG_PROXY_BASE = '/api/proxy'
const CACHE_KEY = 'maiworld_catalog_gold'

type GoldEntry = { tokenId?: number; title?: string; uri?: string }

/**
 * Fetch structured release data from the configured Catalog proxy.
 * Uses the /releases endpoint that parses Catalog HTML server-side.
 * Falls back to bundled whitelist.json and localStorage cache.
 */
async function fetchFromProxy(): Promise<GoldEntry[]> {
  try {
    const url = `${CATALOG_PROXY_BASE}/releases`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Proxy returned ${res.status}`)
    const data = await res.json()
    if (Array.isArray(data.releases)) {
      return data.releases.map((r: any) => ({
        tokenId: r.tokenId,
        title: r.title,
        uri: r.uri,
      }))
    }
    return []
  } catch (err) {
    console.warn('Catalog proxy fetch failed:', err)
    return []
  }
}

export async function getCachedGoldList(): Promise<GoldEntry[]> {
  // 1. Try the proxy first (structured data, server-parsed)
  const proxyEntries = await fetchFromProxy()
  if (proxyEntries.length > 0) {
    // Cache in localStorage for offline fallback
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), items: proxyEntries }))
    } catch { /* ignore */ }
    return proxyEntries
  }

  // 2. Fall back to bundled whitelist.json
  try {
    const res = await fetch('/whitelist.json')
    if (res.ok) {
      const j = await res.json()
      const items = (j.goldReleases || []).map((r: any) => ({
        tokenId: r.tokenId,
        title: r.title,
        uri: r.uri,
      }))
      if (items.length > 0) return items
    }
  } catch { /* ignore */ }

  // 3. Fall back to localStorage cache
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const age = Date.now() - (parsed.fetchedAt || 0)
      // TTL 24h
      if (age < 24 * 60 * 60 * 1000 && Array.isArray(parsed.items)) {
        return parsed.items
      }
    }
  } catch { /* ignore */ }

  // 4. Empty — Catalog is unreachable
  return []
}
