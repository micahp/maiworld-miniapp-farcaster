import { describe, it, expect, vi } from 'vitest'

// Test the metadata resolution logic (unit-test the inline helpers via
// extracting them or testing through resolveMetadata).

// We test normalization and extraction logic that is internal to metadata.ts.
// Since the module relies on fetch, we test the side-effect-free helpers
// by importing and checking behavior.
describe('metadata resolution', () => {
  it('normalizes ipfs:// URIs to dweb.link', async () => {
    const { resolveMetadata } = await import('../src/services/metadata')
    // With no fetch available, this will throw — but we can verify
    // the normalization is applied by checking the fetch URL.
    // We use a fetch spy to capture the first URL attempted.
    const fetchSpy = vi.fn(async () => {
      return new Response(JSON.stringify({ name: 'Test', image: 'ipfs://QmTest/img.png' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchSpy)

    const result = await resolveMetadata('ipfs://QmTest/metadata.json')
    expect(fetchSpy).toHaveBeenCalled()
    const firstCall = (fetchSpy.mock.calls[0] as any)[0] as string
    expect(firstCall).toContain('dweb.link/ipfs/')
    expect(firstCall).not.toContain('ipfs://')
    expect(result.image).toContain('dweb.link/ipfs/')
  })

  it('returns name and image from valid metadata', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      return new Response(JSON.stringify({
        name: 'MAi Art #42',
        image: 'https://arweave.net/abc123/img.png',
        animation_url: 'https://arweave.net/abc123/vid.mp4',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }))

    const { resolveMetadata } = await import('../src/services/metadata')
    const result = await resolveMetadata('https://arweave.net/abc123')
    expect(result.name).toBe('MAi Art #42')
    expect(result.image).toBe('https://arweave.net/abc123/img.png')
    expect(result.animation_url).toBe('https://arweave.net/abc123/vid.mp4')
  })

  it('throws on empty URI', async () => {
    const { resolveMetadata } = await import('../src/services/metadata')
    await expect(resolveMetadata('')).rejects.toThrow('No metadata URI')
  })
})
