### [Decision 1]: Token-gated GB Mini App implementation choices
**Timestamp (UTC):** 2025-08-19T20:39:00Z
**Scope:** `index.html`, `package.json`, `vite.config.ts`, `src/main.ts`, `src/styles.css`, `src/services/ownership.ts`, `src/services/catalog.ts`, `src/emulator.ts`, `public/whitelist.json`, `public/roms/Maiworld_8-25-21.gb`

**Change Summary:**
- Implemented an initial Vite + TypeScript scaffold for a Farcaster Mini App that performs
  token-gating checks for the MAi collection and exposes a minimal 90s-styled UI. The app
  caches Catalog 1/1 releases, queries an injected EIP-1193 provider via `ethers`, and
  console.logs and surfaces whether the user holds relevant NFTs.

**Rationale:**
- The user requested a token-gated Game Boy mini-app that: (1) discovers MAi Catalog 1/1
  releases, (2) checks ownership on-chain for contract `0xb8c4e87a...fc39`, and (3)
  launches an in-browser emulator when allowed. A static scaffold with caching and
  an incremental implementation approach (placeholder emulator → real emulator) lets
  us ship read-only features quickly while keeping the design and UX constraints.

**Alternatives Considered:**
- Dynamic-only discovery via Catalog/OpenSea API — rejected due to CORS and API-key risk;
  instead implemented a runtime fetch with a local cached fallback (`public/whitelist.json`).
- Emulator choices: embed a full Wasm emulator (WasmBoy) now — deferred to keep initial
  iteration small; added a placeholder loader to make switching easier.

**Trade-offs / Risks:**
- Current token discovery uses a best-effort page parse and a cached whitelist fallback; this
  may miss newly released token IDs until the cache is updated or whitelist is updated.
- The ownership-detection performs a conservative scan (bounded brute-force) for token IDs
  when necessary; this is slower and not exhaustive—should be replaced by indexed queries.
- CORS on Catalog or IPFS gateways can break metadata resolution in client environments.

**Follow-ups / TODOs:**
- Integrate a production-safe Catalog API or a small server-side proxy to fetch structured
  token lists and metadata (remove brittle HTML parse). (priority: high)
- Replace `public/roms/Maiworld_8-25-21.gb` placeholder with the real ROM binary and
  integrate WasmBoy (or equivalent) to run the ROM with input and save-state support.
- Improve edition detection (any token holder in the contract may play) by relying on
  a light index or by calling a trusted indexer to avoid brute-force ownerOf scans.
- Add tests (Jest + mocked provider) covering gating logic and Catalog caching.
- Add CI step to run build and basic smoke tests in GH Actions and deploy to Pages.

**Source Prompt(s):**
- "Users open the app and it scans for one of these NFTs https://opensea.io/collection/maiworld https://catalog.works/mai?tab=releases and it displays the media of a catalog gold 1/1 nft if they have it and otherwise an edition if they have that..."
- "these ids don't change so it can be done once and stored."
- "anybody that holds an NFT in this contract is allowed to play the game"

---

Implemented vs placeholder (what's done / what's left):
- Done (implemented): repository scaffold, Catalog fetch + local cache, ownership checks
  against `0xb8c4e87a...fc39`, simple UI that logs holdings and shows feedback,
  Play button wired to a placeholder emulator loader, commit history created.
- Placeholder / to implement: the actual Game Boy emulator integration (WasmBoy or
  alternative), real ROM binary replacement (placeholder file currently), robust
  metadata resolution for nested `ipfs://` resources, and production token indexing.


