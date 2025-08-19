import './styles.css'
import { checkOwnership } from './services/ownership'
import { getCachedGoldList } from './services/catalog'

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
      result.innerHTML = `<div class="have">You own NFTs: <pre>${JSON.stringify(res.tokens, null, 2)}</pre></div>`
    } else {
      result.innerHTML = `<div class="no">You do not own any required NFTs. <a href="https://opensea.io/collection/maiworld" target="_blank">Buy on OpenSea</a></div>`
    }
  } catch (err: any) {
    console.error(err)
    result.innerHTML = `<div class="error">Error: ${err?.message || err}</div>`
  }
})


