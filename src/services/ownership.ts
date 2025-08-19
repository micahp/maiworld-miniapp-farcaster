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
  // Farcaster Mini App should inject an EIP-1193 provider; use window.ethereum fallback
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const provider = (window as any).ethereum
  if (!provider) throw new Error('No injected Ethereum provider found')
  return new ethers.BrowserProvider(provider)
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
    // ignore
  }

  const results: Array<{ type: string; tokenId?: string; metadataUri?: string }> = []

  if (is1155) {
    progress('Detected ERC-1155 contract')
    const c = new ethers.Contract(CONTRACT_ADDRESS, ERC1155_ABI, provider)
    // For 1155 we don't know all IDs; check a reasonable set? Instead we check ownership of any token by seeing if
    // the contract exposes totalSupply (not standard). As a fallback, we will attempt a simple approach: query token ids from a small known list.
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
    const c = new ethers.Contract(CONTRACT_ADDRESS, ERC721_ABI, provider)
    // First check balanceOf to see if user holds any tokens
    try {
      const bal = await c.balanceOf(user)
      if (bal && bal.toNumber() > 0) {
        // We don't know token IDs; for speed we will attempt to find some by brute-forcing a small range
        // In practice, a better approach is to fetch indexed data from Catalog/OpenSea; here we attempt a lightweight scan.
        const foundIds: number[] = []
        const maxScan = 200
        for (let id = 1; id <= maxScan; id++) {
          try {
            const owner = await c.ownerOf(id)
            if (owner && owner.toLowerCase() === user.toLowerCase()) {
              foundIds.push(id)
              const uri = await c.tokenURI(id).catch(() => '')
              results.push({ type: 'ERC721', tokenId: String(id), metadataUri: uri })
              // stop early if we found as many as balance
              if (foundIds.length >= bal.toNumber()) break
            }
          } catch (e) {
            // ownerOf may throw for non-existent ids; ignore
          }
        }
      }
    } catch (e) {
      // If balanceOf fails, fall back to brute force scan for ownership by checking ownerOf directly
      for (let id = 1; id <= 200; id++) {
        try {
          const owner = await c.ownerOf(id)
          if (owner && owner.toLowerCase() === user.toLowerCase()) {
            const uri = await c.tokenURI(id).catch(() => '')
            results.push({ type: 'ERC721', tokenId: String(id), metadataUri: uri })
          }
        } catch (e) {
        }
      }
    }
  }

  const ownsAny = results.length > 0
  if (!ownsAny) progress('No matching NFTs found')
  else progress(`Found ${results.length} token(s)`)

  return { ownsAny, tokens: results }
}


