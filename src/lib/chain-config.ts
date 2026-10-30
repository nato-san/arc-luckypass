/**
 * Chain configuration — single source of truth for Testnet / Mainnet switching.
 *
 * Set VITE_CHAIN=mainnet in .env (or Vercel environment variables) to target
 * Arc Mainnet. Any other value (or absent) defaults to Arc Testnet.
 *
 * After deploying LuckyPass to Mainnet, also set:
 *   VITE_LUCKY_PASS_ADDRESS_MAINNET=0x<deployed address>
 *   VITE_DEPLOY_BLOCK_MAINNET=<deploy block number>
 */

import { arc, arcTestnet } from 'viem/chains'

const IS_MAINNET = (import.meta.env.VITE_CHAIN as string | undefined) === 'mainnet'

// ── Active chain ──────────────────────────────────────────────────────────────
export const ACTIVE_CHAIN = IS_MAINNET ? arc : arcTestnet
export const CHAIN_ID      = ACTIVE_CHAIN.id   // 5042 | 5042002
export const IS_TESTNET    = !IS_MAINNET

// ── LuckyPass contract ────────────────────────────────────────────────────────
const TESTNET_ADDRESS  = '0xab7678c528f1d517d642c13e3fd97124a743abe8' as const
const MAINNET_ADDRESS  = (import.meta.env.VITE_LUCKY_PASS_ADDRESS_MAINNET ?? '') as `0x${string}`

export const LUCKY_PASS_CONTRACT_ADDRESS: `0x${string}` = IS_MAINNET
  ? MAINNET_ADDRESS
  : TESTNET_ADDRESS

// ── D20DAO VRF Coordinator ────────────────────────────────────────────────────
export const VRF_COORDINATOR: `0x${string}` = IS_MAINNET
  ? '0xd20da057469C45928912d983F45790C41e290571'   // Arc Mainnet (confirmed responsive)
  : '0xd20DA0FF9087d053f0291524Eac12abA1ADBd945'   // Arc Testnet

// ── USDC ERC-20 (same address on both Testnet and Mainnet) ────────────────────
export const USDC_CONTRACT_ADDRESS = '0x3600000000000000000000000000000000000000' as const

// ── Deploy block (getLogs lower bound) ───────────────────────────────────────
const TESTNET_DEPLOY_BLOCK  = 69_049_215n
const MAINNET_DEPLOY_BLOCK  = BigInt(
  (import.meta.env.VITE_DEPLOY_BLOCK_MAINNET as string | undefined) ?? '0'
)

export const DEPLOY_BLOCK: bigint = IS_MAINNET
  ? MAINNET_DEPLOY_BLOCK
  : TESTNET_DEPLOY_BLOCK

// ── RPC URL ───────────────────────────────────────────────────────────────────
export const RPC_URL: string = IS_MAINNET
  ? 'https://rpc.mainnet.arc.io'
  : 'https://rpc.testnet.arc.io'

// ── Explorer ──────────────────────────────────────────────────────────────────
export const EXPLORER_BASE: string = IS_MAINNET
  ? 'https://explorer.arc.io'
  : 'https://explorer.testnet.arc.io'

export function buildTxUrl(hash: string): string {
  return `${EXPLORER_BASE}/tx/${hash}`
}
