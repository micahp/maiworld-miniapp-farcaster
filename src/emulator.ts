/**
 * Load the MaiWorld GameBoy emulator using the WasmBoy npm package.
 * Supports keyboard/gamepad input, save-state, and overlay/inline rendering.
 */

export interface EmulatorHandle {
  canvas: HTMLCanvasElement
  romSize: number
  /** Clean up listeners and pause the emulator. */
  destroy: () => void
}

const SAVE_KEY = 'maiworld_gb_savestate'

// ── Key → Joypad bit mapping ────────────────────────────────────────────
type JoypadKey = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'A' | 'B' | 'SELECT' | 'START'

const KEY_MAP: Record<string, JoypadKey> = {
  ArrowUp: 'UP',
  ArrowDown: 'DOWN',
  ArrowLeft: 'LEFT',
  ArrowRight: 'RIGHT',
  z: 'A',
  x: 'B',
  ' ': 'A',        // Spacebar → A (modern browsers)
  Spacebar: 'A',    // Legacy
  Enter: 'START',
  Shift: 'SELECT',
}

// ── Helpers ─────────────────────────────────────────────────────────────

function isFormActive(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable
}

async function loadWasmBoyModule(): Promise<any> {
  // Dynamic import from the npm package – WasmBoy is a named export.
  const mod = await import('wasmboy')
  return mod.WasmBoy
}

async function loadSaveStateFromStorage(): Promise<any> {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore parse errors */ }
  return null
}

async function persistSaveState(state: any): Promise<void> {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state))
  } catch { /* ignore quota errors */ }
}

// ── Main loader ─────────────────────────────────────────────────────────

export async function loadEmulator(
  romPath: string,
  mountEl?: HTMLElement | null,
  onProgress?: (msg: string) => void,
): Promise<EmulatorHandle> {
  onProgress?.('Fetching ROM...')
  const res = await fetch(romPath)
  if (!res.ok) throw new Error(`Failed to fetch ROM: ${res.status}`)
  const buf = await res.arrayBuffer()

  // Quick sanity check
  const MIN_ROM_BYTES = 256
  if (buf.byteLength < MIN_ROM_BYTES) {
    const msg = `ROM too small (${buf.byteLength} bytes). Replace ${romPath} with real .gb binary.`
    console.error(msg)
    onProgress?.(msg)
    showPlaceholderOverlay(msg)
    return {
      canvas: document.createElement('canvas'),
      romSize: buf.byteLength,
      destroy: () => {},
    }
  }

  onProgress?.('Initializing WasmBoy...')

  // ── Container / canvas ──────────────────────────────────────────────────
  const isOverlay = !mountEl
  const container = document.createElement('div')

  if (isOverlay) {
    Object.assign(container.style, {
      position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
      width: '50vw', height: '50vh', zIndex: '9999',
      display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center',
      background: '#081018', border: '6px solid #f6f2d4',
      boxShadow: '0 8px 30px rgba(0,0,0,0.8)', boxSizing: 'border-box',
    })
  } else {
    Object.assign(container.style, {
      display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center',
      width: '100%', height: '100%', boxSizing: 'border-box',
    })
  }

  const canvas = document.createElement('canvas')
  canvas.width = 160 * 3
  canvas.height = 144 * 3
  canvas.style.imageRendering = 'pixelated'
  canvas.style.background = '#000'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.maxWidth = '100%'
  canvas.style.maxHeight = '100%'
  container.appendChild(canvas)

  // ── Overlay: backdrop + close + button bar (save/load/gamepad) ──────────
  let cleanupFns: Array<() => void> = []

  if (isOverlay) {
    const backdrop = document.createElement('div')
    Object.assign(backdrop.style, {
      position: 'fixed', left: '0', top: '0', width: '100%', height: '100%',
      background: 'rgba(0,0,0,0.6)', zIndex: '9998',
    })
    backdrop.addEventListener('click', () => destroy())
    document.body.appendChild(backdrop)

    const close = document.createElement('button')
    close.className = 'btn'
    close.textContent = 'Close'
    Object.assign(close.style, {
      position: 'absolute', right: '12px', top: '12px', zIndex: '10000',
    })
    close.tabIndex = -1
    close.addEventListener('mousedown', (e) => e.preventDefault())
    close.addEventListener('click', () => destroy())

    document.body.appendChild(backdrop)
    document.body.appendChild(container)
    document.body.appendChild(close)

    // Save-state & gamepad toolbar
    const toolbar = document.createElement('div')
    Object.assign(toolbar.style, {
      position: 'absolute', left: '12px', bottom: '12px', zIndex: '10000',
      display: 'flex', gap: '6px',
    })

    const btnStyle = 'background:#222;color:#f6f2d4;border:2px solid #f6f2d4;padding:6px 10px;font-size:11px;cursor:pointer;border-radius:4px;font-family:monospace'

    const saveBtn = document.createElement('button')
    saveBtn.textContent = '💾 Save'
    saveBtn.setAttribute('style', btnStyle)
    saveBtn.addEventListener('click', () => saveGame())

    const loadBtn = document.createElement('button')
    loadBtn.textContent = '📂 Load'
    loadBtn.setAttribute('style', btnStyle)
    loadBtn.addEventListener('click', () => loadGame())

    const gpBtn = document.createElement('button')
    gpBtn.textContent = '🎮 Gamepad'
    gpBtn.setAttribute('style', btnStyle)
    let gamepadOn = false
    gpBtn.addEventListener('click', () => {
      if (gamepadOn) {
        WasmBoyInstance?.disableDefaultJoypad()
        gamepadOn = false
        gpBtn.textContent = '🎮 Gamepad'
      } else {
        WasmBoyInstance?.enableDefaultJoypad()
        gamepadOn = true
        gpBtn.textContent = '🎮 Gamepad ✓'
      }
    })

    toolbar.appendChild(saveBtn)
    toolbar.appendChild(loadBtn)
    toolbar.appendChild(gpBtn)
    container.appendChild(toolbar)

    // ── Touch controls (mobile D-pad + A/B) ────────────────────────────────
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    if (isTouchDevice) {
      const touchPad = document.createElement('div')
      Object.assign(touchPad.style, {
        position: 'absolute', right: '12px', bottom: '12px', zIndex: '10000',
        display: 'grid', gridTemplateColumns: 'repeat(3, 52px)', gridTemplateRows: 'repeat(3, 52px)',
        gap: '2px',
      })

      const padBtnStyle = [
        'background:rgba(246,242,212,0.15)', 'color:#f6f2d4',
        'border:2px solid rgba(246,242,212,0.4)', 'borderRadius:8px',
        'display:flex', 'alignItems:center', 'justifyContent:center',
        'fontSize:18px', 'userSelect:none', 'touchAction:none',
      ].join(';')

      const makeTouchBtn = (label: string, joypadKey: JoypadKey, gridArea?: string): HTMLButtonElement => {
        const btn = document.createElement('button')
        btn.textContent = label
        btn.setAttribute('style', padBtnStyle)
        if (gridArea) btn.style.gridArea = gridArea
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); pressedKeys.add(joypadKey); updateJoypad() })
        btn.addEventListener('touchend', (e) => { e.preventDefault(); pressedKeys.delete(joypadKey); updateJoypad() })
        btn.addEventListener('touchcancel', (e) => { pressedKeys.delete(joypadKey); updateJoypad() })
        // Also support mouse for dev/testing on desktop
        btn.addEventListener('mousedown', (e) => { e.preventDefault(); pressedKeys.add(joypadKey); updateJoypad() })
        btn.addEventListener('mouseup', (e) => { pressedKeys.delete(joypadKey); updateJoypad() })
        btn.addEventListener('mouseleave', (e) => { pressedKeys.delete(joypadKey); updateJoypad() })
        return btn
      }

      // D-pad layout:   [  ] [▲] [  ]
      //                 [◄] [  ] [►]
      //                 [  ] [▼] [  ]
      touchPad.appendChild(makeTouchBtn('▲', 'UP'))
      touchPad.appendChild(makeTouchBtn('◄', 'LEFT'))
      const empty = document.createElement('div'); touchPad.appendChild(empty)
      touchPad.appendChild(makeTouchBtn('►', 'RIGHT'))
      touchPad.appendChild(makeTouchBtn('▼', 'DOWN'))

      // Action buttons: A / B
      const actionPad = document.createElement('div')
      Object.assign(actionPad.style, {
        position: 'absolute', left: '12px', bottom: '12px', zIndex: '10000',
        display: 'flex', gap: '6px',
      })
      actionPad.appendChild(makeTouchBtn('B', 'B'))
      actionPad.appendChild(makeTouchBtn('A', 'A'))

      // START / SELECT small buttons
      const menuPad = document.createElement('div')
      Object.assign(menuPad.style, {
        position: 'absolute', left: '50%', bottom: '12px', zIndex: '10000',
        display: 'flex', gap: '6px', transform: 'translateX(-50%)',
      })
      const smallBtnStyle = padBtnStyle.replace('fontSize:18px', 'fontSize:11px').replace('52px', '44px')
      const makeSmallBtn = (label: string, joypadKey: JoypadKey): HTMLButtonElement => {
        const btn = document.createElement('button')
        btn.textContent = label
        btn.setAttribute('style', smallBtnStyle)
        btn.style.width = '56px'; btn.style.height = '34px'
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); pressedKeys.add(joypadKey); updateJoypad() })
        btn.addEventListener('touchend', (e) => { e.preventDefault(); pressedKeys.delete(joypadKey); updateJoypad() })
        btn.addEventListener('mousedown', (e) => { e.preventDefault(); pressedKeys.add(joypadKey); updateJoypad() })
        btn.addEventListener('mouseup', (e) => { pressedKeys.delete(joypadKey); updateJoypad() })
        return btn
      }
      menuPad.appendChild(makeSmallBtn('SELECT', 'SELECT'))
      menuPad.appendChild(makeSmallBtn('START', 'START'))

      container.appendChild(touchPad)
      container.appendChild(actionPad)
      container.appendChild(menuPad)
    }

    // Make container focusable for keyboard capture
    container.tabIndex = -1
  } else {
    // Inline mount
    mountEl!.innerHTML = ''
    mountEl!.appendChild(container)
  }

  // ── Load WasmBoy ────────────────────────────────────────────────────────
  let WasmBoyInstance: any = null
  const romBytes = new Uint8Array(buf)

  try {
    WasmBoyInstance = await loadWasmBoyModule()
    console.log('WasmBoy module loaded:', !!WasmBoyInstance)
  } catch (err) {
    console.error('Failed to load WasmBoy npm module:', err)
    onProgress?.('WasmBoy failed to load — showing placeholder')
    showPlaceholderDraw(canvas)
    return { canvas, romSize: buf.byteLength, destroy }
  }

  try {
    // Config with canvas; isAudioEnabled can be toggled if wanted
    await WasmBoyInstance.config(
      { isAudioEnabled: true, isGbcEnabled: true, gameboyFrameRate: 60 },
      canvas,
    )
    await WasmBoyInstance.loadROM(romBytes)
    console.log('WasmBoy ROM loaded')
    onProgress?.('ROM loaded; starting emulation...')
    await WasmBoyInstance.play()
    console.log('WasmBoy started')
  } catch (err) {
    console.error('WasmBoy init/load error:', err)
    onProgress?.('Emulator init failed — showing placeholder')
    showPlaceholderDraw(canvas)
    return { canvas, romSize: buf.byteLength, destroy }
  }

  // ── Keyboard input (capture phase) ──────────────────────────────────────
  const pressedKeys = new Set<JoypadKey>()

  function updateJoypad() {
    if (!WasmBoyInstance) return
    const state: Record<string, number> = { UP: 0, DOWN: 0, LEFT: 0, RIGHT: 0, A: 0, B: 0, SELECT: 0, START: 0 }
    pressedKeys.forEach((k) => { state[k] = 1 })
    try { WasmBoyInstance.setJoypadState(state) } catch { /* ignore */ }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (isFormActive()) return
    const k = KEY_MAP[e.key]
    if (!k) return
    e.preventDefault()
    e.stopPropagation()
    pressedKeys.add(k)
    updateJoypad()
  }

  function onKeyUp(e: KeyboardEvent) {
    if (isFormActive()) return
    const k = KEY_MAP[e.key]
    if (!k) return
    e.preventDefault()
    e.stopPropagation()
    pressedKeys.delete(k)
    updateJoypad()
  }

  window.addEventListener('keydown', onKeyDown, { capture: true })
  window.addEventListener('keyup', onKeyUp, { capture: true })
  cleanupFns.push(() => {
    window.removeEventListener('keydown', onKeyDown, { capture: true })
    window.removeEventListener('keyup', onKeyUp, { capture: true })
  })

  // rAF loop for continuous joypad state
  let rafId = 0
  function joypadFrame() {
    if (pressedKeys.size) updateJoypad()
    rafId = requestAnimationFrame(joypadFrame)
  }
  rafId = requestAnimationFrame(joypadFrame)
  cleanupFns.push(() => cancelAnimationFrame(rafId))

  // ── Save / Load state ───────────────────────────────────────────────────
  async function saveGame() {
    if (!WasmBoyInstance) return
    try {
      const state = await WasmBoyInstance.saveState()
      await persistSaveState(state)
      console.log('Save state persisted')
      showToast('💾 Saved!')
    } catch (err) {
      console.error('Save failed:', err)
      showToast('Save failed')
    }
  }

  async function loadGame() {
    if (!WasmBoyInstance) return
    try {
      const state = await loadSaveStateFromStorage()
      if (!state) { showToast('No save found'); return }
      await WasmBoyInstance.loadState(state)
      console.log('Save state loaded')
      showToast('📂 Loaded!')
    } catch (err) {
      console.error('Load failed:', err)
      showToast('Load failed')
    }
  }

  onProgress?.('Emulator running (WasmBoy)')

  // ── Destroy / teardown ──────────────────────────────────────────────────
  function destroy() {
    try { WasmBoyInstance?.pause() } catch { /* ignore */ }
    cleanupFns.forEach((fn) => fn())
    try { container.remove() } catch { /* ignore */ }
    // Remove backdrop + close button if overlay
    if (isOverlay) {
      document.querySelectorAll('*').forEach((el) => {
        const z = (el as HTMLElement).style.zIndex
        if (z === '9998' || z === '10000') {
          try { el.remove() } catch { /* ignore */ }
        }
      })
    }
  }

  return { canvas, romSize: buf.byteLength, destroy }
}

// ── Placeholder fallbacks ────────────────────────────────────────────────

function showPlaceholderDraw(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#0b1220'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#b6f'
  ctx.font = '20px monospace'
  ctx.fillText('MAiWorld (demo)', 16, 40)
}

function showPlaceholderOverlay(message: string) {
  const overlay = document.createElement('div')
  Object.assign(overlay.style, {
    position: 'fixed', left: '5%', top: '5%', width: '90%', height: '90%',
    zIndex: '9999', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#081018', border: '6px solid #f6f2d4',
  })
  const inner = document.createElement('div')
  inner.style.cssText = 'padding:20px;color:#f6f2d4;font-family:monospace;text-align:center'
  inner.textContent = message
  overlay.appendChild(inner)

  const close = document.createElement('button')
  close.className = 'btn'
  close.textContent = 'Close'
  close.style.cssText = 'position:absolute;right:12px;top:12px'
  close.addEventListener('click', () => overlay.remove())
  overlay.appendChild(close)
  document.body.appendChild(overlay)
}

function showToast(message: string) {
  const toast = document.createElement('div')
  Object.assign(toast.style, {
    position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
    background: '#f6f2d4', color: '#081018', padding: '8px 20px', borderRadius: '6px',
    fontFamily: 'monospace', fontSize: '14px', zIndex: '20000',
    transition: 'opacity 0.3s',
  })
  toast.textContent = message
  document.body.appendChild(toast)
  setTimeout(() => {
    toast.style.opacity = '0'
    setTimeout(() => toast.remove(), 300)
  }, 1500)
}
