const CATALOG_URL = 'https://catalog.works/mai?tab=releases'
const CACHE_KEY = 'maiworld_catalog_gold'

type GoldEntry = { tokenId?: number; title?: string; uri?: string }

async function fetchCatalogPage(): Promise<string> {
  const res = await fetch(CATALOG_URL, { cache: 'no-store' })
  if (!res.ok) throw new Error('Failed to fetch Catalog releases')
  return await res.text()
}

function parseHtmlForReleases(html: string): GoldEntry[] {
  // Best-effort parsing: look for release titles in the page. Token IDs may not be present in the HTML
  // so this is a fallback to collect titles which can be manually mapped to token IDs in whitelist.json.
  const entries: GoldEntry[] = []
  try {
    const rx = /Artwork for ([\s\S]*?) by MAi/g
    let m
    while ((m = rx.exec(html)) !== null) {
      const title = m[1].trim()
      if (title) entries.push({ title })
    }
  } catch (e) {
    // ignore
  }
  return entries
}

export async function getCachedGoldList(): Promise<GoldEntry[]> {
  // First, prefer bundled whitelist shipped with the app (stable token IDs)
  try {
    const res = await fetch('/whitelist.json')
    if (res.ok) {
      const j = await res.json()
      return (j.goldReleases || []).map((r: any) => ({ tokenId: r.tokenId, title: r.title, uri: r.uri }))
    }
  } catch (e) {
    // ignore
  }

  // Next, try localStorage cache
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const age = Date.now() - (parsed.fetchedAt || 0)
      // TTL 24h
      if (age < 24 * 60 * 60 * 1000 && Array.isArray(parsed.items)) return parsed.items
    }
  } catch (e) {
    // ignore
  }

  // Lastly, attempt to fetch Catalog page and parse (best-effort)
  try {
    const html = await fetchCatalogPage()
    const items = parseHtmlForReleases(html)
    if (items && items.length > 0) {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), items }))
      } catch (e) {
        // ignore storage errors
      }
      return items
    }
  } catch (e) {
    // fallback to empty
  }

  return []
}


