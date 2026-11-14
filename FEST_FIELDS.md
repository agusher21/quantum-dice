# FEST_FIELDS.md — Quantum Dice (build.qorechain.io project form)

Exact field contents for the Quantum Dice project page. The fest form does
NOT save drafts — fill every field in ONE session from Toni's signed-in
@agusher21 account, then click Create project.

## Fields

- **Project name:** Quantum Dice
- **Category:** Quantum Pass (team size 1, solo)
- **Region:** Asia-Pacific
- **Tagline (≤ 140 chars):**
  Roll the dice on QoreChain testnet — every roll is a hybrid-signed transaction.
- **GitHub repository:** https://github.com/agusher21/quantum-dice
- **Live demo URL:** https://quantum-dice.vercel.app
- **Video URL:** https://quantum-dice.vercel.app/demo-video.mp4
- **Featured image:** upload `public/cover.jpg` (2048×1152, 16:9 JPG)
- **Testnet address(es) used:** qor1ntpfg4zpxxkpwzwrh0uwdqqyz36lqnmp8nmpz0
  (Toni's QoreX wallet — also the house address)

## About

Quantum Dice is a mini-game on the QoreChain testnet: guess a number from
1 to 6, stake 0.01 testnet QOR to the house, and the chain decides the
result. Every roll is a hybrid-signed transaction (secp256k1 + ML-DSA-87)
— the result is the last byte of your committed transaction hash, mod 6,
plus 1, so nobody knows the outcome before the roll lands on chain. A
wins leaderboard and recent-rolls feed track every roll, each linked to
its on-chain transaction. Testnet only — QOR here has no real value, and
wins are leaderboard honour (the house never pays out).

## How it's made

Built with create-qorechain-dapp v0.14.0 (Vite + React + TypeScript) and
@qorechain/sdk v0.14.0 on the qorechain-diana testnet. The app connects
to the QoreX wallet and sends each roll as a native MsgSend (0.01 QOR,
memo "Quantum Dice guess:N") through qorexSignAndBroadcast — QoreX signs
every transfer twice (secp256k1 + ML-DSA-87) and registers the
post-quantum key on the first transaction, so no smart contract is
needed. Balances are read over the QoreChain REST API through a
same-origin /lcd proxy (the public API sends no CORS headers). The demo
runs on Vercel; a ?mock=1 mode simulates rolls for trying the UI without
a wallet.

## Checklist before submitting

- [ ] Repo is public at https://github.com/agusher21/quantum-dice
- [ ] Demo live at https://quantum-dice.vercel.app (loads, cover shows)
- [ ] Video link opens and plays (48 s)
- [ ] First REAL roll done by Toni in QoreX (0.01 QOR, hybrid-signed) —
      do this BEFORE creating the page so the project already has a
      hybrid-signed tx when the site verifies it
- [ ] Cover uploaded from public/cover.jpg
