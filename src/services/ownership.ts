import { ethers } from 'ethers'

const CONTRACT_ADDRESS = '0xb8c4e87a6bcd6f70e04fc9430f8c76c5dfe1fc39'

const ERC165_ABI = [
  'function supportsInterface(bytes4 interfaceID) view returns (bool)'
]

const ERC721_ABI = [
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenURI(uint256 tokenId) view returns (string)'
]

const ERC1155_ABI = [
  'function balanceOf(address account, uint256 id) view returns (uint256)',
  'function uri(uint256 id) view returns (string)'
]

type ProgressCb = (msg: string) => void

async function getProvider(): Promise<ethers.BrowserProvider> {
  // Prefer Farcaster injected provider (EIP-1193) or window.ethereum
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const winProvider = (window as any).ethereum
  if (!winProvider) throw new Error('No injected Ethereum provider found')

  // Ensure the wallet is prompted to connect (eth_requestAccounts) before creating BrowserProvider
  try {
    if (typeof winProvider.request === 'function') {
      await winProvider.request({ method: 'eth_requestAccounts' })
    } else if (typeof winProvider.send === 'function') {
      // legacy
      await winProvider.send('eth_requestAccounts', [])
    }
  } catch (e) {
    // user may have dismissed; let downstream handle lack of accounts
  }

  return new ethers.BrowserProvider(winProvider)
}

export async function checkOwnership(progress: ProgressCb) {
  progress('Connecting to provider...')
  const provider = await getProvider()
  const accounts = await provider.listAccounts()
  if (!accounts || accounts.length === 0) throw new Error('No accounts available; please sign in with your wallet')
  const user = accounts[0].address
  progress(`Using address ${user}`)

  const contract165 = new ethers.Contract(CONTRACT_ADDRESS, ERC165_ABI, provider)
  let is1155 = false
  try {
    is1155 = await contract165.supportsInterface('0xd9b67a26')
  } catch (e) {
    // ignore - assume ERC-721 when uncertain
  }

  // instantiate basic ERC721 interface to read balance and name where applicable
  const erc721 = new ethers.Contract(CONTRACT_ADDRESS, ERC721_ABI, provider)
  let contractName = ''
  try {
    contractName = (await erc721.name?.()) || ''
  } catch (e) {
    // ignore if name() not implemented
  }

  const results: Array<{ type: string; tokenId?: string; metadataUri?: string } | { type: string; count: string }> = []

  if (is1155) {
    progress('Detected ERC-1155 contract')
    const c = new ethers.Contract(CONTRACT_ADDRESS, ERC1155_ABI, provider)
    const candidateIds = [1, 2, 3, 4, 5]
    for (const id of candidateIds) {
      const bal = await c.balanceOf(user, id)
      if (bal && bal.toNumber() > 0) {
        const uri = await c.uri(id).catch(() => '')
        results.push({ type: 'ERC1155', tokenId: String(id), metadataUri: uri })
      }
    }
  } else {
    progress('Assuming ERC-721 contract')
    try {
      const bal = await erc721.balanceOf(user)
      if (bal && bal.toNumber() > 0) {
        // Instead of brute-force ownerOf scans, rely on balanceOf for gating
        results.push({ type: 'ERC721', count: bal.toString() })
      }
    } catch (e) {
      // If balanceOf fails, fallback to a limited ownerOf scan (legacy contract behavior)
      try {
        const c = new ethers.Contract(CONTRACT_ADDRESS, ERC721_ABI, provider)
        for (let id = 1; id <= 200; id++) {
          try {
            const owner = await c.ownerOf(id)
            if (owner && owner.toLowerCase() === user.toLowerCase()) {
              const uri = await c.tokenURI(id).catch(() => '')
              results.push({ type: 'ERC721', tokenId: String(id), metadataUri: uri })
            }
          } catch (e) {
            // ignore
          }
        }
      } catch (err) {
        // give up
      }
    }
  }

  const ownsAny = results.length > 0
  if (!ownsAny) progress('No matching NFTs found')
  else progress(`Found ${results.length} token(s)`)

  return { ownsAny, tokens: results, contractName }
}


