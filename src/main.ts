import './styles.css'
import { checkOwnership } from './services/ownership'
import { getCachedGoldList } from './services/catalog'
import { loadEmulator } from './emulator'
import { resolveMetadata } from './services/metadata'

const app = document.getElementById('app')!

app.innerHTML = `
  <div class="container">
    <h1 class="title">MAiWorld GB</h1>
    <div id="status" class="status">Initializing...</div>
    <button id="scanBtn" class="btn">Scan my NFTs</button>
    <div id="result" class="result"></div>
  </div>
`

const status = document.getElementById('status')!
const result = document.getElementById('result')!
const scanBtn = document.getElementById('scanBtn') as HTMLButtonElement

;(async function prefetch() {
  status.textContent = 'Loading catalog releases (cached)...'
  try {
    const gold = await getCachedGoldList()
    console.log('Cached gold list:', gold)
    status.textContent = `Catalog cached entries: ${gold.length}`
  } catch (e) {
    status.textContent = 'Failed to load catalog cache'
  }
})()

scanBtn.addEventListener('click', async () => {
  status.textContent = 'Requesting provider & address...'
  try {
    const res = await checkOwnership((msg) => {
      status.textContent = msg
    })

    console.log('Ownership check result:', res)
    if (res.ownsAny) {
      // Fetch metadata for first token that provides a metadataUri
      const firstWithUri = res.tokens.find((t: any) => (t && typeof t === 'object' && 'metadataUri' in t && (t as any).metadataUri))
      let mediaHtml = `<pre>${JSON.stringify(res.tokens, null, 2)}</pre>`
      if (firstWithUri && typeof firstWithUri === 'object' && 'metadataUri' in firstWithUri && (firstWithUri as any).metadataUri) {
        try {
          const md = await resolveMetadata((firstWithUri as any).metadataUri)
          console.log('Resolved metadata:', md)
          const image = md.image || ''
          const name = md.name || ''
          const animation = md.animation_url || ''
          mediaHtml = `<div class="media"><div class="media-header">${name}</div><img class="cover" src="${image}" alt="${name}" /></div>`
          if (animation) {
            mediaHtml += `<div style="display:none" id="videoUrl">${animation}</div>`
            // show video immediately instead of separate mount
            mediaHtml += `<div id="videoMount"><video class="media-video" src="${animation}" controls autoplay muted playsinline></video></div>`
          }
        } catch (e) {
          console.warn('metadata resolve failed', e)
        }
      }
      result.innerHTML = `<div class="have">You own NFTs: ${mediaHtml}</div><div style="margin-top:8px"><button id="playBtn" class="btn">Play Game</button></div>`
    } else {
      result.innerHTML = `<div class="no">You do not own any required NFTs. <a href="https://opensea.io/collection/maiworld" target="_blank">Buy on OpenSea</a></div>`
    }
  } catch (err: any) {
    console.error(err)
    result.innerHTML = `<div class="error">Error: ${err?.message || err}</div>`
  }
})

// delegate play button click
result.addEventListener('click', async (e) => {
  const target = e.target as HTMLElement
  if (target && target.id === 'playBtn') {
    status.textContent = 'Loading emulator...'
    try {
      const mount = document.createElement('div')
      mount.style.marginTop = '12px'
      document.querySelector('.container')!.appendChild(mount)
      await loadEmulator('/public/roms/Maiworld_8-25-21.gb', mount, (m) => (status.textContent = m))
      status.textContent = 'Emulator running'
    } catch (err: any) {
      status.textContent = `Emulator error: ${err?.message || err}`
    }
  }
  if (target && target.id === 'playVideoBtn') {
    const videoUrlEl = document.getElementById('videoUrl')
    const mount = document.createElement('div')
    mount.style.marginTop = '12px'
    document.querySelector('.container')!.appendChild(mount)
    const videoUrl = videoUrlEl ? videoUrlEl.textContent || '' : ''
    if (videoUrl) {
      const v = document.createElement('video')
      v.src = videoUrl
      v.controls = true
      v.width = 320
      v.height = 180
      v.style.objectFit = 'cover'
      mount.innerHTML = ''
      mount.appendChild(v)
      v.play().catch(() => {})
    }
  }
})


