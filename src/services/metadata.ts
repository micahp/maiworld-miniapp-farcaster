function normalizeIpfs(uri: string): string {
  if (!uri) return uri
  if (uri.startsWith('ipfs://')) {
    // ipfs://CID/path => https://dweb.link/ipfs/CID/path
    return uri.replace('ipfs://', 'https://dweb.link/ipfs/')
  }
  if (uri.startsWith('ipfs/')) {
    return 'https://dweb.link/' + uri
  }
  return uri
}

async function tryFetchJson(url: string): Promise<any> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json') || ct.includes('text/json') || url.endsWith('.json')) {
    return await res.json()
  }
  // Some tokenURIs return JSON as text
  try {
    return await res.json()
  } catch (e) {
    const text = await res.text()
    try { return JSON.parse(text) } catch { return { raw: text } }
  }
}

export async function resolveMetadata(uri: string): Promise<{ name?: string; image?: string; animation_url?: string; raw?: any }> {
  if (!uri) throw new Error('No metadata uri')
  let resolved = uri
  // normalize ipfs links
  resolved = normalizeIpfs(resolved)

  // First try direct fetch
  try {
    const data = await tryFetchJson(resolved)
    const image = data.image || data.image_url || data.imageURI || data.imageUrl
    const animation = data.animation_url || data.animation || data.video || data.animationUrl
    return { name: data.name, image: image ? normalizeIpfs(String(image)) : undefined, animation_url: animation ? normalizeIpfs(String(animation)) : undefined, raw: data }
  } catch (err) {
    // fallback to using the proxy if available
    // The proxy endpoint if deployed should be set on window.__CATALOG_PROXY_URL
    const proxy = (window as any).__CATALOG_PROXY_URL || '/api/proxy?target='
    if (!proxy) throw err
    const proxied = proxy.endsWith('=') || proxy.endsWith('?target=') ? proxy + encodeURIComponent(uri) : `${proxy}${encodeURIComponent(uri)}`
    const data = await tryFetchJson(proxied)
    const image = data.image || data.image_url || data.imageURI || data.imageUrl
    const animation = data.animation_url || data.animation || data.video || data.animationUrl
    return { name: data.name, image: image ? normalizeIpfs(String(image)) : undefined, animation_url: animation ? normalizeIpfs(String(animation)) : undefined, raw: data }
  }
}


