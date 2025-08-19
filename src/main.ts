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
      // Hide the original scan button and replace with per-token play buttons
      scanBtn.style.display = 'none'

      // Ensure actions container exists (replaces scan area)
      let actions = document.getElementById('actions')
      if (!actions) {
        actions = document.createElement('div')
        actions.id = 'actions'
        actions.style.marginTop = '12px'
        document.querySelector('.container')!.insertBefore(actions, result)
      }
      actions.innerHTML = ''

      // Create a gallery mount to show each owned token image (lazy-loaded)
      let gallery = document.getElementById('gallery')
      if (!gallery) {
        gallery = document.createElement('div')
        gallery.id = 'gallery'
        gallery.style.display = 'grid'
        gallery.style.gridTemplateColumns = 'repeat(auto-fit, minmax(160px, 1fr))'
        gallery.style.gap = '12px'
        gallery.style.marginTop = '12px'
        document.querySelector('.container')!.appendChild(gallery)
      }
      gallery.innerHTML = ''

      // Populate gallery with cards for each token; metadata will be fetched lazily
      res.tokens.forEach((token: any, idx: number) => {
        const card = document.createElement('div')
        card.className = 'token-card'
        card.style.border = '2px solid #222'
        card.style.padding = '8px'
        card.style.background = '#081018'
        card.style.color = 'var(--panel)'
        card.style.display = 'flex'
        card.style.flexDirection = 'column'
        card.style.alignItems = 'center'
        card.dataset.metadata = token.metadataUri || ''

        const title = document.createElement('div')
        title.className = 'token-title'
        title.textContent = token.tokenId ? `#${token.tokenId}` : token.type
        title.style.marginBottom = '8px'

        const img = document.createElement('img')
        img.className = 'cover'
        img.alt = title.textContent || 'token'
        img.style.background = '#000'
        img.dataset.src = ''

        card.appendChild(title)
        card.appendChild(img)
        gallery!.appendChild(card)
      })

      // Create a single master Play button that replaces the Scan button
      const masterPlay = document.createElement('button')
      masterPlay.id = 'masterPlay'
      masterPlay.className = 'btn'
      masterPlay.textContent = 'Play Game'
      masterPlay.style.margin = '8px'
      actions!.appendChild(masterPlay)

      // Lazy-load metadata when each card enters viewport
      const observer = new IntersectionObserver(async (entries, obs) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const card = entry.target as HTMLElement
          const meta = card.dataset.metadata
          if (!meta) { obs.unobserve(card); continue }
          try {
            const md = await resolveMetadata(meta)
            const img = card.querySelector('img.cover') as HTMLImageElement
            if (md.image) img.src = md.image
            const title = card.querySelector('.token-title')
            if (md.name && title) title.textContent = md.name
            if (md.animation_url) card.dataset.animation = md.animation_url
          } catch (e) {
            console.warn('lazy metadata fetch failed', e)
          }
          obs.unobserve(card)
        }
      }, { root: null, rootMargin: '0px', threshold: 0.1 })

      document.querySelectorAll('#gallery .token-card').forEach((c) => observer.observe(c))

      // select first token by default
      const firstCard = document.querySelector('#gallery .token-card') as HTMLElement | null
      if (firstCard) firstCard.classList.add('selected')

      // Overlay play button on each card and click-to-select (no per-card Play buttons below images)
      document.querySelectorAll('#gallery .token-card').forEach((card, idx) => {
        const overlay = document.createElement('button')
        overlay.className = 'overlay-play'
        overlay.innerHTML = '►'
        overlay.title = 'Play this token'
        overlay.style.position = 'absolute'
        overlay.style.left = '50%'
        overlay.style.top = '50%'
        overlay.style.transform = 'translate(-50%,-50%)'
        overlay.style.background = 'rgba(0,0,0,0.6)'
        overlay.style.color = '#f6f2d4'
        overlay.style.border = '2px solid #fff5'
        overlay.style.padding = '8px 12px'
        overlay.style.borderRadius = '50%'
        overlay.style.cursor = 'pointer'
        overlay.dataset.tokenIndex = String(idx)
        ;(card as HTMLElement).style.position = 'relative'
        ;(card as HTMLElement).appendChild(overlay)

        overlay.addEventListener('click', async (ev) => {
          ev.stopPropagation()
          // mark selected
          document.querySelectorAll('#gallery .token-card').forEach((el) => el.classList.remove('selected'))
          ;(card as HTMLElement).classList.add('selected')
          // If this token has an animation_url, play it in-place; otherwise trigger master Play
          const animation = (card as HTMLElement).dataset.animation || ''
          if (animation) {
            // hide img if present
            const imgEl = card.querySelector('img.cover') as HTMLImageElement | null
            if (imgEl) imgEl.style.display = 'none'
            // reuse existing video if present
            let v = card.querySelector('video.token-video') as HTMLVideoElement | null
            if (!v) {
              v = document.createElement('video')
              v.className = 'token-video media-video'
              v.src = animation
              v.controls = true
              v.autoplay = true
              v.muted = true // allow autoplay in browsers; user can unmute
              v.playsInline = true
              card.appendChild(v)
            }
            try { await v.play() } catch (_) { /* ignore play errors */ }
          } else {
            masterPlay.click()
          }
        })

        card.addEventListener('click', () => {
          document.querySelectorAll('#gallery .token-card').forEach((el) => el.classList.remove('selected'))
          ;(card as HTMLElement).classList.add('selected')
        })
      })

      result.innerHTML = `<div class="have">You own ${res.tokens.length} token(s).</div>`

      // wire master play button to launch emulator for selected token
      masterPlay.addEventListener('click', async () => {
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
      })
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


