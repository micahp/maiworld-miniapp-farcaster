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

  // Detect ERC721Enumerable early so we can avoid ownerOf brute-force scans
  let isEnumerableGlobal = false
  try {
    isEnumerableGlobal = await contract165.supportsInterface('0x780e9d63')
  } catch (e) {
    // ignore
  }
  console.log('ERC721Enumerable supported (early):', isEnumerableGlobal)
  progress(`ERC721Enumerable supported: ${isEnumerableGlobal}`)

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
        // Try to use ERC-721 Enumerable if available to list token IDs
        let isEnumerable = false
        try {
          isEnumerable = await contract165.supportsInterface('0x780e9d63')
        } catch (ie) {
          // ignore - treat as non-enumerable
        }
        // log enumeration support for debugging
        console.log('ERC721Enumerable supported:', isEnumerable)
        progress(`ERC721Enumerable supported: ${isEnumerable}`)

        if (isEnumerable) {
          // tokenOfOwnerByIndex(owner, index) -> tokenId
          const enumerableAbi = ['function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)']
          const enumContract = new ethers.Contract(CONTRACT_ADDRESS, [...ERC721_ABI, ...enumerableAbi], provider)
          for (let i = 0; i < bal.toNumber(); i++) {
            try {
              const tid = await enumContract.tokenOfOwnerByIndex(user, i)
              const tokenIdStr = String(ethers.toBigInt(tid))
              const uri = await erc721.tokenURI?.(tokenIdStr).catch(() => '')
              results.push({ type: 'ERC721', tokenId: tokenIdStr, metadataUri: uri })
            } catch (err) {
              // non-fatal; continue
            }
          }
        } else {
          // Non-enumerable: reconstruct ownership from Transfer events (safer than brute-force ownerOf)
          try {
            const transferTopic = ethers.id('Transfer(address,address,uint256)')
            // topics for indexed address params are 32-byte hex, right-padded with leading zeros
            const userAddress = user.toLowerCase()
            const userTopic = '0x' + userAddress.replace(/^0x/, '').padStart(64, '0')

            // Fetch logs where `to` is user and where `from` is user, then combine and process in order
            const toLogs = await provider.getLogs({
              address: CONTRACT_ADDRESS,
              topics: [transferTopic, null, userTopic],
              fromBlock: 0,
              toBlock: 'latest'
            }).catch(() => [])

            const fromLogs = await provider.getLogs({
              address: CONTRACT_ADDRESS,
              topics: [transferTopic, userTopic, null],
              fromBlock: 0,
              toBlock: 'latest'
            }).catch(() => [])

            const allLogs = [...toLogs, ...fromLogs]
            // sort by blockNumber then logIndex (both may be hex strings)
            allLogs.sort((a: any, b: any) => {
              const abn = Number(a.blockNumber)
              const bbn = Number(b.blockNumber)
              if (abn !== bbn) return abn - bbn
              return (a.logIndex || 0) - (b.logIndex || 0)
            })

            const owned = new Set<string>()
            for (const log of allLogs) {
              const fromTopic = log.topics[1]
              const toTopic = log.topics[2]
              const tokenTopic = log.topics[3]
              if (!tokenTopic) continue
              const tokenId = String(ethers.toBigInt(tokenTopic))
              if (toTopic && toTopic.toLowerCase() === userTopic.toLowerCase()) {
                owned.add(tokenId)
              }
              if (fromTopic && fromTopic.toLowerCase() === userTopic.toLowerCase()) {
                owned.delete(tokenId)
              }
            }

            for (const tid of Array.from(owned)) {
              const uri = await erc721.tokenURI?.(tid).catch(() => '')
              results.push({ type: 'ERC721', tokenId: tid, metadataUri: uri })
            }
          } catch (err) {
            // if logs approach fails, fall back to returning the count only
            results.push({ type: 'ERC721', count: bal.toString() })
          }
        }
      }
    } catch (e) {
      // If balanceOf fails, reconstruct ownership from Transfer logs (avoid ownerOf scans)
      try {
        const transferTopic = ethers.id('Transfer(address,address,uint256)')
        const userAddress = user.toLowerCase()
        const userTopic = '0x' + userAddress.replace(/^0x/, '').padStart(64, '0')

        const toLogs = await provider.getLogs({
          address: CONTRACT_ADDRESS,
          topics: [transferTopic, null, userTopic],
          fromBlock: 0,
          toBlock: 'latest'
        }).catch(() => [])

        const fromLogs = await provider.getLogs({
          address: CONTRACT_ADDRESS,
          topics: [transferTopic, userTopic, null],
          fromBlock: 0,
          toBlock: 'latest'
        }).catch(() => [])

        const allLogs = [...toLogs, ...fromLogs]
        allLogs.sort((a: any, b: any) => {
          const abn = Number(a.blockNumber)
          const bbn = Number(b.blockNumber)
          if (abn !== bbn) return abn - bbn
          return (a.logIndex || 0) - (b.logIndex || 0)
        })

        const owned = new Set<string>()
        for (const log of allLogs) {
          const fromTopic = log.topics[1]
          const toTopic = log.topics[2]
          const tokenTopic = log.topics[3]
          if (!tokenTopic) continue
          const tokenId = String(ethers.toBigInt(tokenTopic))
          if (toTopic && toTopic.toLowerCase() === userTopic.toLowerCase()) {
            owned.add(tokenId)
          }
          if (fromTopic && fromTopic.toLowerCase() === userTopic.toLowerCase()) {
            owned.delete(tokenId)
          }
        }

        for (const tid of Array.from(owned)) {
          const uri = await erc721.tokenURI?.(tid).catch(() => '')
          results.push({ type: 'ERC721', tokenId: tid, metadataUri: uri })
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


