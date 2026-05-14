import { describe, it, expect, vi, beforeEach } from 'vitest'

// We test the module by mocking fetch and localStorage

describe('catalog service', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    // Reset module cache so imports re-evaluate with fresh mocks
    vi.resetModules()
  })

  it('falls back to whitelist.json when proxy is unreachable', async () => {
    // Mock proxy returning 500
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/api/proxy/releases')) {
        return new Response(null, { status: 500 })
      }
      if (url === '/whitelist.json') {
        return new Response(JSON.stringify({
          goldReleases: [
            { tokenId: 16, title: 'Pi²', uri: 'https://arweave.net/abc' },
            { tokenId: 42, title: 'DEPARTURE', uri: 'https://arweave.net/def' },
          ],
        }), { status: 200 })
      }
      return new Response(null, { status: 404 })
    }))

    // Dynamic re-import so mocks take effect
    const { getCachedGoldList } = await import('../src/services/catalog')
    const entries = await getCachedGoldList()
    expect(entries.length).toBeGreaterThanOrEqual(1)
    expect(entries.some((e: any) => e.tokenId === 16)).toBe(true)
  })

  it('uses proxy data when available and caches it', async () => {
    const proxyData = { releases: [{ title: 'Test Art', tokenId: 1 }] }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/api/proxy/releases')) {
        return new Response(JSON.stringify(proxyData), { status: 200 })
      }
      return new Response(null, { status: 404 })
    }))

    const { getCachedGoldList } = await import('../src/services/catalog')
    const entries = await getCachedGoldList()
    expect(entries.length).toBe(1)
    expect(entries[0].title).toBe('Test Art')

    // localStorage should be updated
    const cached = JSON.parse(localStorage.getItem('maiworld_catalog_gold')!)
    expect(cached.items[0].title).toBe('Test Art')
  })

  it('returns empty array when all sources fail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      return new Response(null, { status: 500 })
    }))

    const { getCachedGoldList } = await import('../src/services/catalog')
    const entries = await getCachedGoldList()
    expect(entries).toEqual([])
  })
})
