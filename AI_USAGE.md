# AI_USAGE.md — Quantum Dice

How AI was used to build this project, what the AI generated, and what the
human did. Written for the QoreChain Developer Fest "Build Before Q-Day",
Best AI-Native Build award.

## The project

**Quantum Dice** — a small web dice game on the QoreChain testnet
(`qorechain-diana`, EVM 9800): guess 1–6, stake 0.01 testnet QOR to the
house, and the result comes from the last byte of your committed
transaction hash (mod 6, plus 1). Every roll is a hybrid-signed
transaction (classical secp256k1 + ML-DSA-87), with a wins leaderboard
and a recent-rolls feed. Quantum Pass category, solo builder. It is the
human builder's second fest project, after Quantum Tip Jar.

- Repo: https://github.com/agusher21/quantum-dice
- Live demo: https://quantum-dice.vercel.app
- Fest page: (to be created by the human at build.qorechain.io)
- Built in one evening: 14 November 2026.

## The AI: what it is and how it worked

The AI is **Muse**, a personal AI agent (Meta). It worked in a chat
conversation with the human builder: the human gave short directions in
Indonesian, the AI did the research, wrote the code, ran the checks, and
reported back with receipts. The loop was: human directs → AI builds and
verifies → human reviews the live result → next direction. No step was
fully autonomous; every deploy was checked live before moving on.

The AI's working method for this project:

1. **Reuse a proven template.** The human's first project, Quantum Tip
   Jar, already proved the stack end to end (scaffold, SDK, QoreX hybrid
   signing, `/lcd` proxy, Vercel deploy, on-chain verification). The AI
   read that project's code first and reused its proven patterns
   (`src/qore.ts` helpers, `vercel.json` rewrite, mock-wallet mode)
   instead of starting from scratch.
2. **Read the docs first.** The AI had already read the QoreChain docs
   for the first project: the SDK quickstart
   (`docs.qorechain.io/sdk/quickstart`), the QoreX integrations guide,
   and the QoreX overview. Key facts: `createClient` defaults to testnet
   `qorechain-diana`; every native QOR transfer must carry a hybrid
   secp256k1 + ML-DSA-87 signature; QoreX adds the ML-DSA-87 layer
   through `signAndBroadcast` (`signDirect` does not — so the app never
   uses it); the ML-DSA-87 key registers on chain with the first
   transaction, so a plain transfer IS the required hybrid-signed
   transaction and no custom smart contract is needed.
3. **Verify everything it claimed.** Typecheck + production build
   (`tsc --noEmit && vite build`), and a headless-Chrome run of the real
   production build in mock mode: connect flow, guess selection, a
   simulated roll (guess 4 → rolled 5, labelled "simulated — not on
   chain"), leaderboard and recent-rolls rendering. The demo video is
   built from those real screenshots of the app.

## What the AI generated

All application code in this repo was written by the AI:

- **`src/App.tsx`** — the whole UI: QoreX connect, guess picker (1–6),
  dice animation, roll button, WIN/LOSE result, stats, leaderboard,
  recent-rolls feed.
- **`src/qore.ts`** — the QoreChain helpers: QoreX provider detection,
  `qorexSignAndBroadcast` roll flow (0.01 QOR `MsgSend` to the house,
  memo `Quantum Dice guess:N`), `rollResult()` (last tx-hash byte % 6 +
  1), balance reads through the `/lcd` proxy, explorer links, the
  localStorage roll ledger.
- **`src/main.tsx`, `src/index.css`, `vite.config.ts`, `vercel.json`** —
  app entry, styling (cosmic background reused from the first project),
  and the Vercel `/lcd` rewrite proxy (the public QoreChain REST API
  sends no CORS headers, so reads go through the same-origin proxy).
- **`README.md`** — project description, how it uses QoreChain, how to
  run it. The AI also drafted the fest project page text (About / How
  it's made) from the same material, saved in `FEST_FIELDS.md`.

Media the AI produced:

- **Cover art** (2048×1152, 16:9) — AI-generated image, a glowing purple
  die with quantum rings (a copy lives at `public/cover.jpg`).
- **Demo video** (48 seconds) — built from real screenshots of the
  production build running in mock mode, with captions explaining the
  flow; hosted at `/demo-video.mp4`. The rolls shown are simulated
  (mock mode) and labelled as such in the app; the first real
  hybrid-signed roll is the human's to make (see below).

Verification the AI performed (and can be re-checked):

- Production build passes (`tsc --noEmit && vite build`, zero errors).
- Mock-roll flow verified end to end in headless Chrome against the
  production build: guess 4 selected, roll completed, result 5 derived
  from the mock tx hash, "Rolled 5 — you guessed 4" shown, recent-rolls
  entry recorded as simulated. Simulated rolls are excluded from the
  stats and leaderboard by design.

## What the human did

The human builder is **Toni (@agusher21)**. His contributions, without
which the project could not exist:

- **The idea.** The AI presented several second-project options; the
  human picked the dice mini-game ("Gas dice") and set the direction
  for it (0.01 QOR per roll, result from the tx hash, leaderboard).
- **The wallet and the keys.** The human installed QoreX, holds the
  24-word phrase, and claimed the faucet himself for the first project.
  The AI never saw, held, or asked for any private key or seed phrase.
- **Every signature.** The AI cannot sign. The first real roll — the
  project's first hybrid-signed transaction — is the human's to approve
  in QoreX. The AI only prepared what to sign.
- **Deployment and fest submission.** The human imports the repo to
  Vercel himself (as he did for the first project) and creates the fest
  project page from his own signed-in session at build.qorechain.io.
  (The fest form does not save drafts, so the fields in
  `FEST_FIELDS.md` are filled and submitted in one session.)
- **Direction and review.** The human directed the build in chat and
  reviews each deploy live on the demo URL before the next step.

## What the AI did NOT do

- Never held, saw, or stored private keys, seed phrases, or wallet
  credentials.
- Never signed a transaction, claimed a faucet, or submitted a form on
  the human's behalf — those are all human taps.
- Never invented a result: the only roll verified so far is a simulated
  mock-mode roll, and it is labelled as such. No on-chain roll is
  claimed in this file — the first real roll is still to be made by the
  human.

## Summary

AI wrote ~100% of the code, docs, cover art, and demo video, and ran the
build and mock-flow verification. The human chose the idea, owns the
wallet and every signature, deploys the demo, submits the fest project,
and directs and reviews each iteration. The project is a genuine
human–AI collaboration: the AI did the typing, the human made the
decisions and the signatures.
