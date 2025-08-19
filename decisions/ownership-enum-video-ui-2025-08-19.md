### [Decision 2]: Ownership enumeration and video UI behavior
**Timestamp (UTC):** 2025-08-19T21:40:00Z
**Scope:** `src/services/ownership.ts`, `src/main.ts`, `src/services/metadata.ts`, `src/styles.css`

**Change Summary:**
- Prefer a bundled `public/whitelist.json` of static Gold token IDs for enumeration; avoid
  blind ownerOf scans. Use a read-only RPC provider for ownerOf calls to prevent MetaMask
  from logging reverts in the extension console. Implement an in-app modal overlay for
  `animation_url` playback and a single master Play button that launches the emulator.

**Rationale:**
- Frequent RPC "execution reverted: ERC721: owner query for nonexistent token" messages
  were caused by ownerOf calls against non-existent token IDs and by brute-force scans.
  Shipping a stable whitelist and using a read RPC provider minimizes noisy wallet errors
  and keeps the client UX clean. The modal overlay for videos centralizes playback and
  prevents duplicate Play buttons across the gallery.

**Alternatives Considered:**
- Continue using injected provider for ownerOf calls — rejected due to noisy console logs.
- Remove ownerOf entirely and rely only on balanceOf — rejected; we still enumerate owned
  Golds when whitelist IDs match the contract and user owns them.

**Trade-offs / Risks:**
- Bundled whitelist requires maintenance when new Gold releases are added; mitigated by
  allowing fallback Catalog parsing and supporting remote hosted whitelist in future.
- Read-only RPC provider may have rate limits; allow override via `window.__READ_RPC_URL`.

**Follow-ups / TODOs:**
- Host a canonical whitelist JSON that the client can fetch to avoid rebuilds.
- Add a small serverless indexer to return owned IDs for addresses to remove on-client
  enumeration entirely.
- Integrate a full WASM emulator and pass selected token metadata into the game.

**Source Prompt(s):**
- "there's not a way for you to search what IDs an address owns on a contract?"
- "welll fucking check" / "the one that's fucking logged in"


