export async function loadEmulator(romPath: string, mountEl: HTMLElement, onProgress?: (msg: string) => void) {
  onProgress?.('Fetching ROM...')
  const res = await fetch(romPath)
  if (!res.ok) throw new Error('Failed to fetch ROM')
  const buf = await res.arrayBuffer()

  onProgress?.('Initializing canvas...')
  const container = document.createElement('div')
  container.style.display = 'flex'
  container.style.flexDirection = 'column'
  container.style.alignItems = 'center'

  const canvas = document.createElement('canvas')
  // GameBoy native resolution 160x144; scale for visibility
  canvas.width = 160 * 3
  canvas.height = 144 * 3
  canvas.style.imageRendering = 'pixelated'
  canvas.style.border = '6px solid #f6f2d4'
  canvas.style.background = '#7ca'

  const info = document.createElement('div')
  info.style.color = '#f6f2d4'
  info.style.marginTop = '8px'
  info.style.fontFamily = 'monospace'
  info.textContent = `ROM loaded — ${buf.byteLength} bytes (placeholder emulator)`

  container.appendChild(canvas)
  container.appendChild(info)

  // clear mount element and append
  mountEl.innerHTML = ''
  mountEl.appendChild(container)

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

  return { canvas, romSize: buf.byteLength }
}


