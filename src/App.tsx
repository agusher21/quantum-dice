import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient, type QoreChainClient } from "@qorechain/sdk";

import {
  aggregateLeaderboard,
  buildRollMemo,
  CHAIN_NAME,
  computeStats,
  connectQorex,
  EXPLORER_HOME,
  FAUCET_URL,
  FEST_URL,
  HOUSE_ADDRESS,
  isQorexInstalled,
  loadLedger,
  recordRoll,
  REST_PROXY_PATH,
  ROLL_AMOUNT_QOR,
  ROLL_AMOUNT_UQOR,
  rollResult,
  sendRoll,
  txRestUrl,
  uqorToQor,
  type RollRecord,
  type RollResult,
} from "./qore.js";

// REST goes through the Vite dev/preview proxy (/lcd -> api-testnet.qore.host)
// because the public REST API sends no CORS headers.
const REST_URL = import.meta.env.VITE_QORE_REST_URL ?? REST_PROXY_PATH;

const DICE_FACES = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e9e5f5",
  borderRadius: 16,
  padding: "1.25rem",
  marginTop: "1rem",
  boxShadow: "0 4px 24px rgba(109, 40, 217, 0.08)",
};

const pill: React.CSSProperties = {
  display: "inline-block",
  padding: "0.2rem 0.65rem",
  borderRadius: 999,
  background: "rgba(237, 233, 254, 0.16)",
  color: "#ede9fe",
  fontSize: "0.8rem",
  fontWeight: 600,
  marginRight: "0.4rem",
  border: "1px solid rgba(237, 233, 254, 0.35)",
};

const linkLight: React.CSSProperties = { color: "#c4b5fd" };

const buttonStyle: React.CSSProperties = {
  padding: "0.65rem 1.4rem",
  border: "none",
  borderRadius: 10,
  background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
  color: "#fff",
  fontSize: "1rem",
  fontWeight: 600,
  cursor: "pointer",
  boxShadow: "0 2px 12px rgba(109, 40, 217, 0.35)",
};

function shortAddress(address: string): string {
  return `${address.slice(0, 10)}…${address.slice(-6)}`;
}

/** Random 64-hex string, shaped like a tx hash, for simulated mock rolls. */
function fakeTxHash(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function App(): JSX.Element {
  const client: QoreChainClient = useMemo(
    () =>
      createClient({
        network: "testnet",
        endpoints: { rest: REST_URL },
      }),
    [],
  );

  const [address, setAddress] = useState<string | null>(null);
  const [balanceUqor, setBalanceUqor] = useState<string | null>(null);
  const [guess, setGuess] = useState<number | null>(null);
  const [rolls, setRolls] = useState<RollRecord[]>(() => loadLedger());
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [displayFace, setDisplayFace] = useState(1);
  const [lastRoll, setLastRoll] = useState<RollRecord | null>(null);
  const [mockOn, setMockOn] = useState(false);

  // Dev-only test aid: ?mock=1 installs the official QoreX test double
  // (@qorechain/qorex-wallet-mock, public test phrase, testnet only) so the
  // connect flow can be tried without the extension. It holds no real funds
  // and must never be funded. Mock rolls are simulated client-side (fake tx
  // hash, clearly labelled) and never touch the chain. Never enabled in
  // production.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mock") !== "1") return;
    let cancelled = false;
    void import("@qorechain/qorex-wallet-mock")
      .then(({ createQorexMock }) => {
        if (cancelled) return;
        // rest: "/lcd" — the mock's in-page REST calls must go through the
        // same-origin /lcd proxy (Vite dev proxy / Vercel rewrite to
        // api-testnet.qore.host); the default https://api-testnet.qore.host
        // is cross-origin from this page and gets CORS-blocked.
        createQorexMock({ profile: "current", rest: "/lcd" }).install(window);
        setMockOn(true);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Dice tumble animation while a roll is in flight.
  useEffect(() => {
    if (!rolling) return;
    const id = window.setInterval(
      () => setDisplayFace(1 + Math.floor(Math.random() * 6)),
      90,
    );
    return () => window.clearInterval(id);
  }, [rolling]);

  const refreshBalance = useCallback(async () => {
    if (!address) return;
    try {
      const res = await client.rest.getAllBalances(address);
      const qor = (res.balances as Array<{ denom: string; amount: string }>).find(
        (b) => b.denom === "uqor",
      );
      setBalanceUqor(qor ? qor.amount : "0");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [address, client]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  async function handleConnect(): Promise<void> {
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      const addr = await connectQorex();
      setAddress(addr);
      setStatus(`Connected to QoreX on ${CHAIN_NAME}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function handleDisconnect(): void {
    setAddress(null);
    setBalanceUqor(null);
    setLastRoll(null);
    setStatus("Disconnected. Your rolls stay on chain and in the leaderboard.");
  }

  async function handleRoll(): Promise<void> {
    setError(null);
    setStatus(null);
    setLastRoll(null);
    if (guess === null) {
      setError("Pick a number from 1 to 6 first.");
      return;
    }
    if (!mockOn) {
      if (!address) {
        setError("Connect QoreX first.");
        return;
      }
      if (balanceUqor !== null && BigInt(balanceUqor) < BigInt(ROLL_AMOUNT_UQOR)) {
        setError(
          `You need at least ${ROLL_AMOUNT_QOR} QOR to roll (balance ${uqorToQor(balanceUqor)} QOR). Top up from the faucet first.`,
        );
        return;
      }
    }
    setBusy(true);
    setRolling(true);
    try {
      let res: RollResult;
      let mock = false;
      if (mockOn) {
        // Simulated roll: no wallet, no chain — a random hash stands in for
        // the committed tx hash, and the result is derived the same way.
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
        res = { txHash: fakeTxHash(), code: 0, height: -1, shield: "mock" };
        mock = true;
      } else {
        setStatus("Waiting for your approval in QoreX… (0.01 QOR to the house)");
        res = await sendRoll(address as string, guess);
      }
      if (res.code !== 0) {
        setError(`Transaction failed on chain (code ${res.code}). Tx: ${res.txHash}`);
        return;
      }
      const result = rollResult(res.txHash);
      const won = result === guess;
      const record: RollRecord = {
        txHash: res.txHash,
        from: mockOn ? "mock-player" : (address as string),
        guess,
        result,
        won,
        amountUqor: ROLL_AMOUNT_UQOR,
        memo: buildRollMemo(guess),
        timestamp: Date.now(),
        shield: res.shield,
        mock: mock || undefined,
      };
      setRolls(recordRoll(record));
      setLastRoll(record);
      setDisplayFace(result);
      setStatus(
        won
          ? `🎉 WIN! You guessed ${guess} and the chain rolled ${result}.` +
              (mock ? " (simulated roll — not on chain)" : " Shield: " + res.shield + ".")
          : `Rolled ${result} — you guessed ${guess}. No win this time.` +
              (mock ? " (simulated roll — not on chain)" : ""),
      );
      if (!mockOn) void refreshBalance();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRolling(false);
      setBusy(false);
    }
  }

  const stats = useMemo(() => computeStats(rolls), [rolls]);
  const leaderboard = useMemo(() => aggregateLeaderboard(rolls), [rolls]);
  const recentRolls = useMemo(
    () => [...rolls].sort((a, b) => b.timestamp - a.timestamp).slice(0, 10),
    [rolls],
  );

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: 760,
        margin: "0 auto",
        padding: "2rem 1rem 3rem",
        lineHeight: 1.5,
        color: "#111827",
        background: "transparent",
        position: "relative",
        minHeight: "100vh",
      }}
    >
      <div className="qj-bg" aria-hidden="true">
        <div className="qj-stars" />
        <div className="qj-orb qj-orb-1" />
        <div className="qj-orb qj-orb-2" />
        <div className="qj-orb qj-orb-3" />
        <div className="qj-orb qj-orb-4" />
      </div>
      <div style={{ position: "relative", zIndex: 1 }}>
      <header>
        <img
          src="/cover.jpg"
          alt="Quantum Dice — a glowing purple die tumbling through deep space with quantum rings, QoreChain Testnet"
          style={{
            width: "100%",
            borderRadius: 16,
            display: "block",
            boxShadow: "0 8px 32px rgba(109, 40, 217, 0.25)",
          }}
        />
        <h1
          style={{
            marginBottom: 0,
            marginTop: "1rem",
            fontSize: "1.9rem",
            color: "#fff",
            textShadow: "0 2px 16px rgba(124, 58, 237, 0.6)",
          }}
        >
          🎲 Quantum Dice
        </h1>
        <p style={{ marginTop: "0.5rem", marginBottom: "0.5rem" }}>
          <span style={pill}>Hybrid-signed</span>
          <span style={pill}>QoreChain Testnet</span>
          <span style={pill}>Quantum Pass</span>
        </p>
        <p style={{ color: "#e9d5ff", marginTop: "0.25rem" }}>
          Roll the dice on QoreChain testnet — every roll is a hybrid-signed
          transaction (secp256k1 + ML-DSA-87). Guess 1–6, stake{" "}
          {ROLL_AMOUNT_QOR} QOR to the house, and the chain decides: the
          result is the last byte of your tx hash, mod 6, plus 1. Nobody
          knows the outcome before the transaction is committed.
        </p>
        <p style={{ color: "#c4b5fd", fontSize: "0.9rem" }}>
          Built for the QoreChain Developer Fest — Quantum Pass. Testnet only;
          QOR here has no real value. Wins are leaderboard honour — the house
          never pays out.
          {mockOn && (
            <span style={{ color: "#b45309" }}>
              {" "}
              [dev mock mode — rolls are simulated, not on chain]
            </span>
          )}
        </p>
      </header>

      <section style={card}>
        <h2 style={{ marginTop: 0 }}>Wallet</h2>
        {address ? (
          <div>
            <p>
              Connected: <code>{shortAddress(address)}</code>
            </p>
            <p>
              Balance:{" "}
              <strong>
                {balanceUqor === null
                  ? "loading…"
                  : `${uqorToQor(balanceUqor)} QOR`}
              </strong>{" "}
              <button
                onClick={() => void refreshBalance()}
                disabled={busy}
                style={{ ...buttonStyle, background: "#e5e7eb", color: "#111827" }}
              >
                Refresh
              </button>{" "}
              <button
                onClick={handleDisconnect}
                style={{ ...buttonStyle, background: "#e5e7eb", color: "#111827" }}
              >
                Disconnect
              </button>
            </p>
            <p style={{ fontSize: "0.9rem", color: "#555" }}>
              Need test QOR? Claim 100 QOR / 24h at the{" "}
              <a href={FAUCET_URL} target="_blank" rel="noreferrer">
                QoreChain faucet
              </a>{" "}
              (dashboard sign-in, paste your <code>qor1…</code> address).
            </p>
          </div>
        ) : (
          <div>
            <p style={{ color: "#555" }}>
              Connect QoreX (switched to Testnet) to roll. No wallet is
              needed to browse the leaderboard.
            </p>
            <button onClick={() => void handleConnect()} disabled={busy} style={buttonStyle}>
              {busy ? "Connecting…" : "Connect QoreX"}
            </button>
            {!isQorexInstalled() && (
              <p style={{ fontSize: "0.9rem", color: "#b45309" }}>
                QoreX was not detected in this browser. Install the QoreX
                extension or open this page in the QoreX app&apos;s dApp
                browser. (Add <code>?mock=1</code> to the URL to try a
                simulated roll without a wallet.)
              </p>
            )}
          </div>
        )}
      </section>

      <section style={card}>
        <h2 style={{ marginTop: 0 }}>Roll the dice</h2>
        <p style={{ marginTop: 0, color: "#555" }}>
          Stake <strong>{ROLL_AMOUNT_QOR} QOR</strong> per roll — it goes to
          the house (<code>{shortAddress(HOUSE_ADDRESS)}</code>). One QoreX
          approval per roll.
        </p>
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            flexWrap: "wrap",
            marginBottom: "1rem",
          }}
          role="group"
          aria-label="Your guess, 1 to 6"
        >
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button
              key={n}
              onClick={() => setGuess(n)}
              disabled={busy}
              aria-pressed={guess === n}
              style={{
                width: 52,
                height: 52,
                fontSize: "1.6rem",
                borderRadius: 12,
                border:
                  guess === n ? "3px solid #7c3aed" : "1px solid #d1d5db",
                background: guess === n ? "#ede9fe" : "#fff",
                cursor: "pointer",
              }}
            >
              {DICE_FACES[n - 1]}
            </button>
          ))}
        </div>
        <p style={{ marginTop: 0 }}>
          Your guess:{" "}
          <strong>{guess === null ? "— pick a number —" : `${guess} ${DICE_FACES[guess - 1]}`}</strong>
        </p>
        <div
          style={{
            fontSize: "4.5rem",
            lineHeight: 1,
            textAlign: "center",
            margin: "0.5rem 0",
          }}
          aria-live="polite"
        >
          {DICE_FACES[displayFace - 1]}
        </div>
        <button
          onClick={() => void handleRoll()}
          disabled={busy || guess === null || (!mockOn && !address)}
          style={{ ...buttonStyle, opacity: guess === null || (!mockOn && !address) ? 0.6 : 1 }}
        >
          {busy ? "Rolling…" : `🎲 Roll (${ROLL_AMOUNT_QOR} QOR, hybrid-signed)`}
        </button>
        {!mockOn && !address && (
          <p style={{ fontSize: "0.9rem", color: "#555" }}>
            Connect QoreX above to enable rolling.
          </p>
        )}
        <p style={{ fontSize: "0.9rem", color: "#555" }}>
          QoreX shows the decoded transfer and the fee before you approve it.
          The wallet adds the ML-DSA-87 layer and registers your post-quantum
          key on your first transaction. Memo:{" "}
          <code>Quantum Dice guess:N</code>.
        </p>
      </section>

      {status && (
        <p
          style={{
            color: "#a7f3d0",
            marginTop: "1rem",
            background: "rgba(6, 95, 70, 0.45)",
            border: "1px solid rgba(167, 243, 208, 0.4)",
            borderRadius: 10,
            padding: "0.6rem 0.9rem",
          }}
          role="status"
        >
          {status}
        </p>
      )}
      {error && (
        <p
          style={{
            color: "#fecaca",
            marginTop: "1rem",
            background: "rgba(127, 29, 29, 0.45)",
            border: "1px solid rgba(252, 165, 165, 0.4)",
            borderRadius: 10,
            padding: "0.6rem 0.9rem",
          }}
          role="alert"
        >
          {error}
        </p>
      )}
      {lastRoll && (
        <p style={{ marginTop: "0.5rem", color: "#e9d5ff" }}>
          {lastRoll.mock ? (
            <>Simulated roll — no on-chain tx (mock hash <code>{lastRoll.txHash.slice(0, 16)}…</code>)</>
          ) : (
            <>
              Tx:{" "}
              <a
                href={txRestUrl(lastRoll.txHash)}
                target="_blank"
                rel="noreferrer"
                style={linkLight}
              >
                <code>{lastRoll.txHash}</code>
              </a>
            </>
          )}
        </p>
      )}

      <section style={card}>
        <h2 style={{ marginTop: 0 }}>📊 Your stats</h2>
        <p style={{ margin: 0 }}>
          Rolls: <strong>{stats.rolls}</strong> · Wins:{" "}
          <strong>{stats.wins}</strong> · Win rate:{" "}
          <strong>
            {stats.rolls > 0
              ? `${(stats.winRate * 100).toFixed(1)}%`
              : "—"}
          </strong>{" "}
          <span style={{ color: "#555" }}>(a fair die wins ~16.7%)</span>
        </p>
      </section>

      <section style={card}>
        <h2 style={{ marginTop: 0 }}>🏆 Top rollers</h2>
        {leaderboard.length === 0 ? (
          <p style={{ color: "#555" }}>
            No real rolls yet — be the first to roll and take the top spot.
          </p>
        ) : (
          <ol style={{ paddingLeft: "1.5rem" }}>
            {leaderboard.map((row, i) => (
              <li key={row.address} style={{ marginBottom: "0.5rem" }}>
                {i === 0 ? "🥇 " : i === 1 ? "🥈 " : i === 2 ? "🥉 " : `${i + 1}. `}
                <code>{shortAddress(row.address)}</code> —{" "}
                <strong>{row.wins} win{row.wins !== 1 ? "s" : ""}</strong> in{" "}
                {row.rolls} roll{row.rolls !== 1 ? "s" : ""} (
                {(row.winRate * 100).toFixed(1)}%)
              </li>
            ))}
          </ol>
        )}
      </section>

      <section style={card}>
        <h2 style={{ marginTop: 0 }}>Recent rolls</h2>
        {recentRolls.length === 0 ? (
          <p style={{ color: "#555" }}>Nothing here yet.</p>
        ) : (
          <ul style={{ paddingLeft: "1.25rem" }}>
            {recentRolls.map((roll) => (
              <li key={roll.txHash} style={{ marginBottom: "0.5rem" }}>
                <code>{roll.mock ? "mock" : shortAddress(roll.from)}</code>{" "}
                guessed <strong>{roll.guess}</strong>, rolled{" "}
                <strong>
                  {roll.result} {DICE_FACES[roll.result - 1]}
                </strong>{" "}
                — {roll.won ? "🎉 WIN" : "lose"}{" "}
                {roll.mock ? (
                  <span style={{ color: "#b45309" }}>(simulated)</span>
                ) : (
                  <a href={txRestUrl(roll.txHash)} target="_blank" rel="noreferrer">
                    tx
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer style={{ marginTop: "1.5rem", fontSize: "0.9rem", color: "#c4b5fd" }}>
        <p>
          How it works: the app connects to QoreX on{" "}
          <code>{CHAIN_NAME}</code>, reads balances over the QoreChain REST
          API, and sends a native <code>MsgSend</code> of {ROLL_AMOUNT_QOR}{" "}
          QOR to the house through <code>qorexSignAndBroadcast</code>. QoreX
          signs every transfer twice (secp256k1 + ML-DSA-87) — that hybrid
          signature is the post-quantum part. The result comes from the
          committed tx hash (last byte % 6 + 1), so it cannot be known or
          changed before the roll lands on chain. No smart contract, no
          server, no custody.
        </p>
        <p>
          <a href={FEST_URL} target="_blank" rel="noreferrer" style={linkLight}>
            QoreChain Developer Fest
          </a>{" "}
          ·{" "}
          <a href={EXPLORER_HOME} target="_blank" rel="noreferrer" style={linkLight}>
            Explorer
          </a>{" "}
          ·{" "}
          <a href={FAUCET_URL} target="_blank" rel="noreferrer" style={linkLight}>
            Faucet
          </a>
        </p>
      </footer>
      </div>
    </main>
  );
}
