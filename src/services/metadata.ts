type MetadataResult = {
  name?: string
  image?: string
  animation_url?: string
  raw?: any
}

function normalizeIpfs(uri: string): string {
  if (!uri) return uri
  if (uri.startsWith('ipfs://')) {
    return uri.replace('ipfs://', 'https://dweb.link/ipfs/')
  }
  if (uri.startsWith('ipfs/')) {
    return 'https://dweb.link/' + uri
  }
  return uri
}

/**
 * Try fetching a URL, preferring JSON. Falls back to raw text.
 */
async function tryFetchJson(url: string): Promise<any> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json') || ct.includes('text/json') || url.endsWith('.json')) {
    return await res.json()
  }
  try {
    return await res.json()
  } catch {
    const text = await res.text()
    try { return JSON.parse(text) } catch { return { raw: text } }
  }
}

/**
 * Try fetching via the serverless proxy.
 */
async function tryProxyFetch(uri: string): Promise<any> {
  const proxyBase = (window as any).__CATALOG_PROXY_URL || '/api/proxy'
  const sep = proxyBase.includes('?') ? '&target=' : '?target='
  const proxyUrl = `${proxyBase}${sep}${encodeURIComponent(uri)}`
  return tryFetchJson(proxyUrl)
}

/**
 * Extract media fields from a metadata object, normalizing IPFS links.
 */
function extractMedia(data: any): Omit<MetadataResult, 'raw'> {
  const image = data.image || data.image_url || data.imageURI || data.imageUrl
  const animation = data.animation_url || data.animation || data.video || data.animationUrl
  return {
    name: data.name,
    image: image ? normalizeIpfs(String(image)) : undefined,
    animation_url: animation ? normalizeIpfs(String(animation)) : undefined,
  }
}

/**
 * Resolve token metadata from a URI.
 *
 * Fallback chain:
 *   1. Direct fetch (normalized URI)
 *   2. Proxy fetch (CORS-safe, server-side)
 *   3. For IPFS: try alternate gateways (ipfs.io, cloudflare-ipfs.com)
 */
export async function resolveMetadata(uri: string): Promise<MetadataResult> {
  if (!uri) throw new Error('No metadata URI')

  let resolved = normalizeIpfs(uri)

  const errors: string[] = []

  // 1. Direct fetch
  try {
    const data = await tryFetchJson(resolved)
    return { ...extractMedia(data), raw: data }
  } catch (e: any) {
    errors.push(`direct: ${e?.message || e}`)
  }

  // 2. Proxy fetch
  try {
    const data = await tryProxyFetch(uri) // pass original URI so proxy resolves it
    return { ...extractMedia(data), raw: data }
  } catch (e: any) {
    errors.push(`proxy: ${e?.message || e}`)
  }

  // 3. Alternate IPFS gateways (if it looks like an IPFS resource)
  if (uri.includes('ipfs') || resolved.includes('dweb.link') || resolved.includes('ipfs.io')) {
    const cidMatch = resolved.match(/\/(Qm[1-9A-HJ-NP-Za-km-z]{44,}|baf[0-9A-Za-z]{50,})/)
    if (cidMatch) {
      const altGateways = [
        `https://ipfs.io/ipfs/${cidMatch[1]}`,
        `https://cloudflare-ipfs.com/ipfs/${cidMatch[1]}`,
        `https://gateway.pinata.cloud/ipfs/${cidMatch[1]}`,
      ]
      for (const gw of altGateways) {
        try {
          const data = await tryFetchJson(gw)
          return { ...extractMedia(data), raw: data }
        } catch (e: any) {
          errors.push(`alt-gw ${gw}: ${e?.message || e}`)
        }
      }
    }
  }

  throw new Error(`Metadata resolution failed: ${errors.join('; ')}`)
}
