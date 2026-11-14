// Quantum Dice — QoreChain helpers.
// Sources (same as Quantum Tip Jar):
// - SDK quickstart: https://docs.qorechain.io/sdk/quickstart
//   (createClient defaults to testnet qorechain-diana; every native QOR transfer
//   must carry a hybrid secp256k1 + ML-DSA-87 signature; QOR has 10^6 uqor.)
// - QoreX integrations: https://docs.qorechain.io/developer-tools/qorex-integrations
//   (window.qorex.native is a Keplr-pattern provider; dApps send messages via
//   signAndBroadcast, QoreX adds the ML-DSA-87 layer and broadcasts; the
//   result carries `shield`, which is `shielded` when the committed tx carries
//   the hybrid layer. signDirect does NOT add the layer — never use it here.)
// - QoreX overview: https://docs.qorechain.io/qorex/overview
//   (every native QOR transfer is signed twice; the ML-DSA-87 key is registered
//   on chain with the first transaction, so a plain MsgSend transfer IS the
//   required hybrid-signed transaction — no custom smart contract is needed.)

import { MsgSend } from "cosmjs-types/cosmos/bank/v1beta1/tx";
import {
  getQorexNative,
  hasCapability,
  qorexSignAndBroadcast,
  type QorexNativeProvider,
} from "@qorechain/qorex-types";

export const CHAIN_ID = "qorechain-diana";
export const CHAIN_NAME = "QoreChain Testnet (qorechain-diana)";
export const EVM_CHAIN_ID = 9800;
export const REST_PROXY_PATH = "/lcd"; // Vite proxies /lcd -> https://api-testnet.qore.host
export const EXPLORER_HOME = "https://explore.qore.network";
export const FAUCET_URL = "https://dashboard.qorechain.io/faucet";
export const FEST_URL = "https://build.qorechain.io";

/**
 * The house. Every roll sends 0.01 testnet QOR here. This is Toni's own
 * QoreX testnet wallet (@agusher21) — testnet only, the QOR has no real
 * value, and the house never pays out: a win is a leaderboard honour, not
 * a payout.
 */
export const HOUSE_ADDRESS =
  "qor1ntpfg4zpxxkpwzwrh0uwdqqyz36lqnmp8nmpz0";

/** Fixed stake per roll: 0.01 QOR = 10,000 uqor. */
export const ROLL_AMOUNT_QOR = "0.01";
export const ROLL_AMOUNT_UQOR = "10000";

/** Tag put at the start of every roll memo so rolls are recognisable on chain. */
export const DICE_MEMO_TAG = "Quantum Dice";

export const MSG_SEND_TYPE_URL = "/cosmos.bank.v1beta1.MsgSend";

/** 1 QOR = 1,000,000 uqor on the native lane. */
export function qorToUqor(qor: string): string {
  const [whole = "0", frac = ""] = qor.trim().split(".");
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(frac) || frac.length > 6) {
    throw new Error("Amount must be a number with at most 6 decimals.");
  }
  const padded = (frac + "000000").slice(0, 6);
  const base = BigInt(whole) * 1_000_000n + BigInt(padded || "0");
  if (base <= 0n) throw new Error("Amount must be greater than 0.");
  return base.toString();
}

export function uqorToQor(uqor: string | number | bigint): string {
  const v = BigInt(uqor);
  const whole = v / 1_000_000n;
  const frac = (v % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

/** Strict-ish bech32 check for a native QoreChain address (qor1 + 38 chars). */
export function isValidQorAddress(address: string): boolean {
  return /^qor1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{38}$/.test(address.trim());
}

export function buildRollMemo(guess: number): string {
  return `${DICE_MEMO_TAG} guess:${guess}`;
}

/**
 * The dice result for a roll: the last byte of the committed tx hash,
 * mod 6, plus 1. The hash is the on-chain randomness — nobody (not the
 * player, not the house) knows the result before the transaction is
 * committed, because the hash does not exist until then.
 */
export function rollResult(txHash: string): number {
  const hex = txHash.startsWith("0x") ? txHash.slice(2) : txHash;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(`Unexpected tx hash format: ${txHash}`);
  }
  const lastByte = parseInt(hex.slice(-2), 16);
  return (lastByte % 6) + 1;
}

/** REST URL that shows a committed tx as JSON (standard Cosmos LCD route). */
export function txRestUrl(txHash: string): string {
  return `https://api-testnet.qore.host/cosmos/tx/v1beta1/txs/${txHash}`;
}

// ---------------------------------------------------------------------------
// QoreX wallet
// ---------------------------------------------------------------------------

export function getNativeProvider(): QorexNativeProvider | null {
  return getQorexNative() ?? null;
}

export function isQorexInstalled(): boolean {
  return getNativeProvider() !== null;
}

export async function connectQorex(): Promise<string> {
  const native = getNativeProvider();
  if (!native) {
    throw new Error(
      "QoreX is not installed in this browser. Install the QoreX extension " +
        "(Chrome/Firefox) or open this page in the QoreX app's dApp browser, " +
        "switch it to Testnet, then try again.",
    );
  }
  if (!hasCapability(native, "signAndBroadcast")) {
    throw new Error(
      "This QoreX build does not expose signAndBroadcast. Update QoreX to the latest store version and try again.",
    );
  }
  // Throws "QoreX: unsupported chain" if the wallet is not on qorechain-diana.
  await native.enable(CHAIN_ID);
  const key = await native.getKey(CHAIN_ID);
  const address = (key as { bech32Address?: string }).bech32Address;
  if (!address || !isValidQorAddress(address)) {
    throw new Error("QoreX returned an unexpected address. Try reconnecting.");
  }
  return address;
}

export interface RollResult {
  txHash: string;
  code: number;
  height: number;
  shield: string;
}

/**
 * Roll the dice: one hybrid-signed MsgSend of 0.01 QOR to the house, memo
 * "Quantum Dice guess:N". QoreX signs it hybrid (secp256k1 + ML-DSA-87)
 * and broadcasts. The result is derived from the committed tx hash.
 */
export async function sendRoll(
  fromAddress: string,
  guess: number,
): Promise<RollResult> {
  if (guess < 1 || guess > 6 || !Number.isInteger(guess)) {
    throw new Error("Guess must be a whole number from 1 to 6.");
  }
  const res = await qorexSignAndBroadcast({
    chainId: CHAIN_ID,
    messages: [
      {
        typeUrl: MSG_SEND_TYPE_URL,
        value: MsgSend.encode({
          fromAddress,
          toAddress: HOUSE_ADDRESS,
          amount: [{ denom: "uqor", amount: ROLL_AMOUNT_UQOR }],
        }).finish(),
      },
    ],
    memo: buildRollMemo(guess),
    gasLimit: 200000,
  });
  return {
    txHash: res.txHash,
    code: res.code ?? -1,
    height: res.height ?? -1,
    shield: res.shield ?? "unknown",
  };
}

// ---------------------------------------------------------------------------
// Roll ledger (localStorage; every entry links to its on-chain tx)
// ---------------------------------------------------------------------------

export interface RollRecord {
  txHash: string;
  from: string;
  guess: number;
  result: number;
  won: boolean;
  amountUqor: string;
  memo: string;
  timestamp: number; // ms since epoch
  shield?: string;
  /** True for ?mock=1 demo rolls: simulated client-side, NOT on chain. */
  mock?: boolean;
}

const LEDGER_KEY = "quantum-dice:ledger:v1";

export function loadLedger(): RollRecord[] {
  try {
    const raw = localStorage.getItem(LEDGER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RollRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordRoll(roll: RollRecord): RollRecord[] {
  const ledger = loadLedger();
  if (!ledger.some((r) => r.txHash === roll.txHash)) {
    ledger.unshift(roll);
    try {
      localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger.slice(0, 500)));
    } catch {
      // Storage full/blocked: the on-chain tx is still the source of truth.
    }
  }
  return ledger;
}

export interface RollerRow {
  address: string;
  rolls: number;
  wins: number;
  winRate: number;
  lastRollAt: number;
}

export function aggregateLeaderboard(rolls: RollRecord[]): RollerRow[] {
  const byPlayer = new Map<string, RollerRow>();
  for (const roll of rolls) {
    if (roll.mock) continue; // simulated demo rolls never rank
    const row = byPlayer.get(roll.from) ?? {
      address: roll.from,
      rolls: 0,
      wins: 0,
      winRate: 0,
      lastRollAt: 0,
    };
    row.rolls += 1;
    if (roll.won) row.wins += 1;
    row.winRate = row.rolls > 0 ? row.wins / row.rolls : 0;
    row.lastRollAt = Math.max(row.lastRollAt, roll.timestamp);
    byPlayer.set(roll.from, row);
  }
  return [...byPlayer.values()].sort((a, b) =>
    a.wins === b.wins
      ? b.rolls - a.rolls || b.lastRollAt - a.lastRollAt
      : b.wins - a.wins,
  );
}

export interface RollStats {
  rolls: number;
  wins: number;
  winRate: number;
}

export function computeStats(rolls: RollRecord[]): RollStats {
  const real = rolls.filter((r) => !r.mock);
  const wins = real.filter((r) => r.won).length;
  return {
    rolls: real.length,
    wins,
    winRate: real.length > 0 ? wins / real.length : 0,
  };
}
