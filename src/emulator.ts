export async function loadEmulator(romPath: string, mountEl?: HTMLElement | null, onProgress?: (msg: string) => void) {
  onProgress?.('Fetching ROM...')
  const res = await fetch(romPath)
  if (!res.ok) throw new Error('Failed to fetch ROM')
  const buf = await res.arrayBuffer()

  onProgress?.('Initializing canvas...')

  // create container either inside provided mount or as a fullscreen overlay
  const container = document.createElement('div')
  const isOverlay = !mountEl
  if (isOverlay) {
    // overlay styles: almost full-screen modal
    container.style.position = 'fixed'
    container.style.left = '5%'
    container.style.top = '5%'
    container.style.width = '90%'
    container.style.height = '90%'
    container.style.zIndex = '9999'
    container.style.display = 'flex'
    container.style.flexDirection = 'column'
    container.style.alignItems = 'center'
    container.style.justifyContent = 'center'
    container.style.background = '#081018'
    container.style.border = '6px solid #f6f2d4'
    container.style.boxShadow = '0 8px 30px rgba(0,0,0,0.8)'
  } else {
    container.style.display = 'flex'
    container.style.flexDirection = 'column'
    container.style.alignItems = 'center'
  }

  const canvas = document.createElement('canvas')
  // GameBoy native resolution 160x144; scale for visibility
  canvas.width = 160 * 3
  canvas.height = 144 * 3
  canvas.style.imageRendering = 'pixelated'
  canvas.style.background = '#000'
  canvas.style.maxWidth = '100%'
  canvas.style.maxHeight = '100%'

  const info = document.createElement('div')
  info.style.color = '#f6f2d4'
  info.style.marginTop = '8px'
  info.style.fontFamily = 'monospace'
  info.textContent = `ROM loaded — ${buf.byteLength} bytes (placeholder emulator)`

  container.appendChild(canvas)
  container.appendChild(info)

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
    close.addEventListener('click', () => {
      try { container.remove() } catch (e) {}
      try { overlayBackdrop?.remove() } catch (e) {}
    })

    document.body.appendChild(overlayBackdrop)
    document.body.appendChild(container)
    container.appendChild(close)
  } else {
    // clear mount element and append
    mountEl!.innerHTML = ''
    mountEl!.appendChild(container)
  }

  // placeholder draw
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
    // @ts-ignore
    const WasmBoy = (window as any).WasmBoy
    if (WasmBoy && typeof WasmBoy.create === 'function') {
      onProgress?.('Initializing WasmBoy...')
      // Create WasmBoy instance and mount to our canvas
      // This uses the global WasmBoy API from the CDN build
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const wb = await WasmBoy.create({
        canvas: canvas,
        // optional: prefer audio disabled initially
        enableAudio: false
      })

      // load ROM buffer
      try {
        // WasmBoy expects Uint8Array
        const romBytes = new Uint8Array(buf)
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        await wb.loadROM(romBytes)
        onProgress?.('WasmBoy ROM loaded; starting...')
        // start emulation
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        wb.run()
      } catch (romErr) {
        console.warn('WasmBoy ROM load failed', romErr)
        onProgress?.('WasmBoy ROM load failed — showing placeholder')
      }

      // basic keyboard mapping: arrow keys and z/x for A/B
      const keyMap: Record<string, string> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
        z: 'a',
        x: 'b',
        Enter: 'start',
        Shift: 'select'
      }

      function keyHandler(e: KeyboardEvent, pressed: boolean) {
        const k = keyMap[e.key]
        if (!k) return
        e.preventDefault()
        try {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          if (pressed) wb.buttonDown(k)
          else wb.buttonUp(k)
        } catch (er) {}
      }

      window.addEventListener('keydown', (e) => keyHandler(e, true))
      window.addEventListener('keyup', (e) => keyHandler(e, false))

      onProgress?.('Emulator running (WasmBoy)')
      return { canvas, romSize: buf.byteLength, wasmboy: wb }
    }
  } catch (wbErr) {
    console.warn('WasmBoy init error', wbErr)
  }

  // If WasmBoy not available or failed, return placeholder
  return { canvas, romSize: buf.byteLength }
}


