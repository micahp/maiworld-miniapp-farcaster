export async function loadEmulator(romPath: string, mountEl?: HTMLElement | null, onProgress?: (msg: string) => void) {
  onProgress?.('Fetching ROM...')
  const res = await fetch(romPath)
  if (!res.ok) throw new Error('Failed to fetch ROM')
  const buf = await res.arrayBuffer()

  // Quick sanity check: many placeholder/text files are tiny. If ROM is
  // suspiciously small, show a clear message instead of attempting to run.
  const MIN_ROM_BYTES = 256
  if (buf.byteLength < MIN_ROM_BYTES) {
    console.error(`Loaded ROM is too small (${buf.byteLength} bytes). Replace ${romPath} with a real .gb binary in public/roms/`)
    // show overlay/message immediately so user sees instructions
    const placeholderContainer = document.createElement('div')
    placeholderContainer.style.padding = '20px'
    placeholderContainer.style.color = '#f6f2d4'
    placeholderContainer.style.fontFamily = 'monospace'
    placeholderContainer.style.textAlign = 'center'
    placeholderContainer.textContent = `ROM loaded — ${buf.byteLength} bytes (invalid/placeholder). Please place the real Maiworld_8-25-21.gb in public/roms/ and reload.`
    // If an overlay is expected, attach placeholder to body
    const overlay = document.createElement('div')
    overlay.style.position = 'fixed'
    overlay.style.left = '5%'
    overlay.style.top = '5%'
    overlay.style.width = '90%'
    overlay.style.height = '90%'
    overlay.style.zIndex = '9999'
    overlay.style.display = 'flex'
    overlay.style.alignItems = 'center'
    overlay.style.justifyContent = 'center'
    overlay.style.background = '#081018'
    overlay.style.border = '6px solid #f6f2d4'
    overlay.appendChild(placeholderContainer)
    const close = document.createElement('button')
    close.className = 'btn'
    close.textContent = 'Close'
    close.style.position = 'absolute'
    close.style.right = '12px'
    close.style.top = '12px'
    close.addEventListener('click', () => overlay.remove())
    overlay.appendChild(close)
    document.body.appendChild(overlay)
    onProgress?.('Invalid ROM — please replace file')
    // store ROM for debugging but don't attempt to run it
    ;(window as any).__MAIWORLD_ROM = buf
    return { canvas: document.createElement('canvas'), romSize: buf.byteLength }
  }

  onProgress?.('Initializing canvas...')

  // create container either inside provided mount or as a fullscreen overlay
  const container = document.createElement('div')
  const isOverlay = !mountEl
  if (isOverlay) {
    // overlay styles: centered modal that fills most of the viewport
    container.style.position = 'fixed'
    container.style.left = '50%'
    container.style.top = '50%'
    container.style.transform = 'translate(-50%,-50%)'
    container.style.width = '40vw'
    container.style.height = '40vh'
    container.style.zIndex = '9999'
    container.style.display = 'flex'
    container.style.flexDirection = 'column'
    // make children stretch to fill container so canvas can scale
    container.style.alignItems = 'stretch'
    container.style.justifyContent = 'center'
    container.style.background = '#081018'
    container.style.border = '6px solid #f6f2d4'
    container.style.boxShadow = '0 8px 30px rgba(0,0,0,0.8)'
    container.style.boxSizing = 'border-box'
  } else {
  container.style.display = 'flex'
  container.style.flexDirection = 'column'
    container.style.alignItems = 'stretch'
    container.style.justifyContent = 'center'
    container.style.width = '100%'
    container.style.height = '100%'
    container.style.boxSizing = 'border-box'
  }

  const canvas = document.createElement('canvas')
  // GameBoy native resolution 160x144; scale for visibility
  canvas.width = 160 * 3
  canvas.height = 144 * 3
  canvas.style.imageRendering = 'pixelated'
  canvas.style.background = '#000'
  // scale canvas to fill parent container while preserving internal resolution
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.maxWidth = '100%'
  canvas.style.maxHeight = '100%'

  // append canvas only; any user-facing messages are shown via overlay or console
  container.appendChild(canvas)

  // If overlay, add close button and backdrop behavior
  let overlayBackdrop: HTMLDivElement | null = null
  if (isOverlay) {
    overlayBackdrop = document.createElement('div')
    overlayBackdrop.style.position = 'fixed'
    overlayBackdrop.style.left = '0'
    overlayBackdrop.style.top = '0'
    overlayBackdrop.style.width = '100%'
    overlayBackdrop.style.height = '100%'
    overlayBackdrop.style.background = 'rgba(0,0,0,0.6)'
    overlayBackdrop.style.zIndex = '9998'

    const close = document.createElement('button')
    close.className = 'btn'
    close.textContent = 'Close'
    close.style.position = 'absolute'
    close.style.right = '12px'
    close.style.top = '12px'
    close.style.zIndex = '10000'
    // prevent Close button from stealing focus on Enter/Space
    close.tabIndex = -1
    close.addEventListener('mousedown', (e) => { e.preventDefault() })
    close.addEventListener('click', () => {
      try { container.remove() } catch (e) {}
      try { overlayBackdrop?.remove() } catch (e) {}
    })

    document.body.appendChild(overlayBackdrop)
    document.body.appendChild(container)
    document.body.appendChild(close)
    // make container focusable so we can capture keyboard events reliably
    container.tabIndex = -1
    container.style.outline = 'none'
    // focus the container so key handlers remain active
    try { container.focus() } catch (e) {}
    // ensure clicking the canvas/container restores focus
    container.addEventListener('click', () => { try { container.focus() } catch (e) {} })
  } else {
  // clear mount element and append
    mountEl!.innerHTML = ''
    mountEl!.appendChild(container)
  }

  // placeholder draw (canvas only)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#0b1220'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#b6f'
  ctx.font = '20px monospace'
  ctx.fillText('MAiWorld (demo)', 16, 40)

  onProgress?.('Emulator placeholder running')

  // store ROM in window for potential real emulator wiring later
  ;(window as any).__MAIWORLD_ROM = buf
  // Try to initialize WasmBoy if available on window (loaded via CDN)
  try {
    // ensure WasmBoy is available; try npm dynamic import first, then window global, then CDN
    // @ts-ignore
    let WasmBoy = (window as any).WasmBoy
    // attempt dynamic npm import (preferred when installed)
    try {
      // dynamic import; suppress TS module-not-found lint if types are absent
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const mod = await import('wasmboy')
      // module might export default or named WasmBoy
      // @ts-ignore
      WasmBoy = mod?.default ?? mod?.WasmBoy ?? mod
      console.log('WasmBoy npm import available:', !!WasmBoy)
    } catch (impErr) {
      console.warn('WasmBoy npm import failed (not installed?):', impErr)
    }
    console.log('WasmBoy global initially:', !!WasmBoy)
    if (!WasmBoy) {
      const cdnCandidates = [
        'https://unpkg.com/wasmboy/dist/wasmboy.min.js',
        'https://cdn.jsdelivr.net/npm/wasmboy/dist/wasmboy.min.js',
        'https://cdn.jsdelivr.net/gh/wasmboy/wasmboy/dist/wasmboy.min.js'
      ]
      let loaded = false
      for (const scriptUrl of cdnCandidates) {
        try {
          console.log('Attempting to load WasmBoy CDN script:', scriptUrl)
          await new Promise<void>((resolve, reject) => {
            const s = document.createElement('script')
            s.src = scriptUrl
            s.async = false
            s.onload = () => resolve()
            s.onerror = (e) => reject(new Error(`WasmBoy CDN script failed to load: ${scriptUrl}`))
            document.head.appendChild(s)
            // timeout
            setTimeout(() => reject(new Error(`WasmBoy CDN script load timeout: ${scriptUrl}`)), 8000)
          })
          // @ts-ignore
          WasmBoy = (window as any).WasmBoy
          console.log('WasmBoy global after dynamic load attempt:', !!WasmBoy, scriptUrl)
          if (WasmBoy) { loaded = true; break }
        } catch (loadErr) {
          console.warn('WasmBoy CDN dynamic load failed for', scriptUrl, loadErr)
        }
      }
      if (!loaded) console.error('All WasmBoy CDN load attempts failed')
    }
    if (WasmBoy) {
      // Two possible shapes: CDN exposes a factory with create(), npm dist exposes
      // a singleton object with methods like loadROM/play/setCanvas.
      if (typeof WasmBoy.create === 'function') {
        onProgress?.('Initializing WasmBoy (factory.create)...')
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const wb = await WasmBoy.create({ canvas: canvas, enableAudio: false })
        console.log('WasmBoy instance created via create():', !!wb)

        try {
          const romBytes = new Uint8Array(buf)
          console.log('ROM bytes length:', romBytes.length)
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          await wb.loadROM(romBytes)
          console.log('WasmBoy ROM loaded successfully (instance)')
          onProgress?.('WasmBoy ROM loaded; starting...')
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          wb.run()
          console.log('WasmBoy instance started')
        } catch (romErr) {
          console.error('WasmBoy instance ROM load failed', romErr)
          onProgress?.('WasmBoy ROM load failed — showing placeholder')
        }

        // buttons via instance API
        const keyMap: Record<string, string> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', z: 'a', x: 'b', Enter: 'start', Shift: 'select' }
        function keyHandlerInstance(e: KeyboardEvent, pressed: boolean) {
          // ignore events originating from form elements so accidental focus doesn't steal controls
          const active = document.activeElement
          if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable)) return
          const k = keyMap[e.key]
          if (!k) return
          e.preventDefault()
          e.stopPropagation()
          try { if (pressed) wb.buttonDown(k); else wb.buttonUp(k) } catch (er) {}
        }
        window.addEventListener('keydown', (e) => keyHandlerInstance(e, true), { capture: true })
        window.addEventListener('keyup', (e) => keyHandlerInstance(e, false), { capture: true })

        onProgress?.('Emulator running (WasmBoy)')
        return { canvas, romSize: buf.byteLength, wasmboy: wb }
      }

      // npm/dist variant: singleton API
      if (typeof WasmBoy.loadROM === 'function') {
        console.log('Using WasmBoy singleton API (npm dist)')
        try {
          // set canvas if available
          try { WasmBoy.setCanvas && WasmBoy.setCanvas(canvas) } catch (e) {}
          const romBytes = new Uint8Array(buf)
          console.log('ROM bytes length:', romBytes.length)
          // WasmBoy.loadROM accepts various inputs; pass Uint8Array
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          await WasmBoy.loadROM(romBytes)
          console.log('WasmBoy singleton ROM loaded')
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          if (typeof WasmBoy.play === 'function') WasmBoy.play()
          else if (typeof WasmBoy.run === 'function') WasmBoy.run()
          console.log('WasmBoy singleton started')

          // controller state mapping
          const controllerState: any = { UP: 0, RIGHT: 0, DOWN: 0, LEFT: 0, A: 0, B: 0, SELECT: 0, START: 0 }
          const keyToState: Record<string, keyof typeof controllerState> = { ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', z: 'A', x: 'B', Enter: 'START', Shift: 'SELECT' }
          function keyHandlerSingleton(e: KeyboardEvent, pressed: boolean) {
            // ignore inputs when user is editing a form element
            const active = document.activeElement
            if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable)) return
            const s = keyToState[e.key]
            if (!s) return
            e.preventDefault()
            e.stopPropagation()
            controllerState[s] = pressed ? 1 : 0
            try { WasmBoy.setJoypadState && WasmBoy.setJoypadState(controllerState) } catch (er) {}
          }
          window.addEventListener('keydown', (e) => keyHandlerSingleton(e, true), { capture: true })
          window.addEventListener('keyup', (e) => keyHandlerSingleton(e, false), { capture: true })

          onProgress?.('Emulator running (WasmBoy singleton)')
          return { canvas, romSize: buf.byteLength, wasmboy: WasmBoy }
        } catch (err) {
          console.error('WasmBoy singleton error', err)
        }
      }
    }
    console.log('WasmBoy.create not available; will use placeholder')
  } catch (wbErr) {
    console.error('WasmBoy init error', wbErr)
  }

  // If WasmBoy not available or failed, return placeholder
  return { canvas, romSize: buf.byteLength }
}


