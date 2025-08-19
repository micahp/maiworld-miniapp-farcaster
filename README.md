# MaiWorld Mini App (Token‑Gated GameBoy)

Development notes
- Install: `npm install`
- Dev: `npm run dev`
- Build: `npm run build`

Proxy server
- A minimal serverless proxy is included at `api/proxy.ts` for fetching Catalog pages with CORS. Deploy
  this on Vercel (or another serverless host) and set `CATALOG_PROXY_URL` in the client to use it. The proxy
  only allows `catalog.works` host to reduce abuse.


