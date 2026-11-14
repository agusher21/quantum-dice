# 🎲 Quantum Dice

Roll the dice on the QoreChain testnet — every roll is a hybrid-signed
transaction. Built for the **QoreChain Developer Fest ("Build Before
Q-Day")**, Quantum Pass category.

Pick a number from 1 to 6, stake **0.01 testnet QOR** to the house, and the
chain decides: the result is the **last byte of your committed transaction
hash, mod 6, plus 1**. Nobody — not the player, not the house — knows the
outcome before the transaction is committed, because the hash does not
exist until then. Every roll is a **hybrid-signed transaction** (classical
secp256k1 + ML-DSA-87, FIPS 204) on the QoreChain testnet
(`qorechain-diana`). No smart contract, no server, no custody.

## What it does

- **Connect QoreX** — one click connects the QoreX wallet (browser extension
  or in-app dApp browser), switched to Testnet. Shows your `qor1…` address
  and testnet QOR balance.
- **Roll the dice** — pick a guess (1–6) and roll. One hybrid-signed
  transaction sends 0.01 QOR to the house with the memo
  `Quantum Dice guess:N`; QoreX shows the decoded transfer and fee for
  approval, then signs hybrid and broadcasts. The result is derived from
  the committed tx hash, shown with a dice animation, WIN/LOSE, and a link
  to the transaction on chain. One QoreX approval per roll.
- **Leaderboard + recent rolls** — players ranked by wins, plus a
  recent-rolls feed with guess, result, and tx link. Wins are leaderboard
  honour only — the house never pays out.
- **Testnet only.** QOR here has no real value.

## How it uses QoreChain

- Built with [`create-qorechain-dapp`](https://www.npmjs.com/package/create-qorechain-dapp)
  v0.14.0 (`fullstack-web` template: Vite + React + TypeScript) and
  [`@qorechain/sdk`](https://docs.qorechain.io/sdk/quickstart) v0.14.0
  (`createClient()` targeting testnet `qorechain-diana`, REST
  `https://api-testnet.qore.host`).
- Wallet connect and signing use
  [`@qorechain/qorex-types`](https://docs.qorechain.io/developer-tools/qorex-integrations)
  v0.1.0: `getQorexNative()` / `hasCapability(native, "signAndBroadcast")`
  for detection, then `qorexSignAndBroadcast()` with a
  `/cosmos.bank.v1beta1.MsgSend` message (encoded with `cosmjs-types`).
  QoreX adds the ML-DSA-87 layer that only the wallet can make; the result
  carries `shield`, which reads `shielded` when the committed transaction
  carries the hybrid layer. `signDirect` is deliberately **not** used — it
  cannot add the post-quantum layer (see the QoreX integrations docs).
- QoreX registers the account's ML-DSA-87 key on chain with the first
  transaction, so a plain native QOR transfer **is** the required
  hybrid-signed transaction — no custom contract is needed.
- Balances are read over the QoreChain REST API (`getAllBalances`). The
  public REST API sends no CORS headers, so the browser reaches it through
  the Vite dev/preview proxy (`/lcd` → `https://api-testnet.qore.host`,
  see `vite.config.ts` and `.env`). In production, serve the app behind a
  proxy that does the same, or point `VITE_QORE_REST_URL` at an endpoint
  that allows your origin.

### Leaderboard — honest limitation

The leaderboard aggregates rolls the app itself has recorded
(localStorage). The public testnet REST gateway's tx-search endpoint does
not serve tx search (verified for the sister project Quantum Tip Jar on
14 Nov 2026 — every query form returns
`{"code":13,"message":"query cannot be empty"}`), so there is currently no
working public route to list all `MsgSend` transactions. Until that
changes, the board lists rolls sent through this app; each entry is
verifiable on chain via its tx link
(`https://api-testnet.qore.host/cosmos/tx/v1beta1/txs/<hash>`).

## How to run it

Prerequisites: Node.js 20+ and npm. A QoreX wallet (browser extension or
mobile app, switched to Testnet) is needed only to roll; browsing the
leaderboard needs no wallet.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc + vite build -> dist/
npm run preview  # serve the production build locally
```

Get test QOR (100 QOR per 24h) from the faucet at
https://dashboard.qorechain.io/faucet — sign in to the dashboard, paste your
`qor1…` address, Request Tokens. No wallet connection is needed for the
claim, and there is no mainnet-balance gate.

### Dev-only test wallet

Append `?mock=1` to the URL to install the official QoreX test double
(`@qorechain/qorex-wallet-mock`, public test phrase, testnet only) and try
the flow without the extension. In mock mode rolls are **simulated
client-side** (a random hash stands in for the committed tx hash, clearly
labelled "simulated — not on chain") and never touch the chain or the
leaderboard. The mock wallet holds no real funds and must never be funded.
Never enabled in production.

## Fest checklist status

- [x] Built with `create-qorechain-dapp` + `@qorechain/sdk`, connects to QoreX
- [x] Public repo + MIT licence + this README
- [x] Cover image 16:9, 2048×1152 px (`public/cover.jpg`)
- [x] Video ≤ 3 min showing the app working (48 s, `public/demo-video.mp4`)
- [ ] Live demo URL (deploy `dist/` to Vercel — remember the `/lcd`
      REST proxy, or the balance reads will hit CORS)
- [ ] ≥ 1 testnet address + ≥ 1 hybrid-signed tx on `qorechain-diana`
      (needs a funded QoreX wallet: faucet claim, then one real roll)
- [ ] Project created at https://build.qorechain.io (Quantum Pass, solo)

> **Deadline note — please re-verify:** the fest page says building ends
> 2 Dec 2026, 23:59 UTC, but the "New project" form banner says
> "Submissions close 25 Nov 2026, 08:00 UTC". Treat **25 Nov 2026, 08:00 UTC**
> as the operative deadline until the organisers confirm otherwise.

## Links

- Fest: https://build.qorechain.io — rules: https://build.qorechain.io/rules
- SDK quickstart: https://docs.qorechain.io/sdk/quickstart
- QoreX integrations: https://docs.qorechain.io/developer-tools/qorex-integrations
- QoreX wallet: https://docs.qorechain.io/qorex/overview
- Explorer: https://explore.qore.network — faucet: https://dashboard.qorechain.io/faucet

## Licence

MIT — see [LICENSE](LICENSE).
