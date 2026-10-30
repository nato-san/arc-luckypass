/**
 * wagmi configuration — Arc LuckyPass
 * Built with Arc Studio — https://studio.arc.io
 *
 * Wallet support:
 *  - injected()       : MetaMask browser extension, Brave Wallet, etc.
 *  - coinbaseWallet() : Coinbase Wallet (mobile + extension)
 *  - walletConnect()  : WalletConnect v2 — QR code on desktop, deep-link on mobile
 *                       Requires VITE_WALLETCONNECT_PROJECT_ID in .env
 *                       Get a free Project ID at https://cloud.walletconnect.com/
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arc, arcTestnet } from 'viem/chains'
import { injected, coinbaseWallet, walletConnect } from 'wagmi/connectors'
import { registerChain } from './tracing'
import { IS_TESTNET, RPC_URL, CHAIN_ID } from '@/lib/chain-config'

// Active chain (Testnet or Mainnet, driven by VITE_CHAIN env var)
const ACTIVE_CHAIN    = IS_TESTNET ? arcTestnet : arc
const ACTIVE_CHAIN_RPC = RPC_URL

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(CHAIN_ID, ACTIVE_CHAIN_RPC)

const APP_NAME = 'Arc LuckyPass'
const WC_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined

// Build connector list — walletConnect only added when Project ID is present
const connectors = [
  injected({ shimDisconnect: true }),
  coinbaseWallet({ appName: APP_NAME }),
  ...(WC_PROJECT_ID
    ? [
        walletConnect({
          projectId: WC_PROJECT_ID,
          metadata: {
            name: APP_NAME,
            description: '限定アイテム抽選 — Lottery-based ticket sales on Arc',
            // Use the canonical Vercel URL so WalletConnect relay can verify the origin.
            // Falls back to current origin in other environments (Arc Studio preview, localhost).
            url: (import.meta.env.VITE_APP_URL as string | undefined) ?? (typeof window !== 'undefined' ? window.location.origin : 'https://arc-luckypass.vercel.app'),
            icons: ['https://arc-luckypass.vercel.app/favicon.ico'],
          },
          // showQrModal: false — ConnectKit manages the modal.
          // true would cause the WC relay to re-open the modal on reconnect.
          showQrModal: false,
        }),
      ]
    : []),
]

export const config = createConfig({
  // mainnet is listed first so WalletConnect uses it as the required namespace
  // when establishing a mobile session. MetaMask mobile recognises mainnet and
  // accepts the session; ChainGuard then prompts the user to switch to the active
  // Arc chain before any transaction is allowed.
  chains: [mainnet, ACTIVE_CHAIN],
  connectors,
  transports: {
    // Both Arc Testnet and Arc Mainnet entries are required by TypeScript even
    // though only one chain is active at runtime (driven by VITE_CHAIN).
    [arc.id]:        http(IS_TESTNET ? undefined : ACTIVE_CHAIN_RPC),
    [arcTestnet.id]: http(IS_TESTNET ? ACTIVE_CHAIN_RPC : undefined),
    [mainnet.id]:    http(), // ENS resolution + WalletConnect required namespace
  },
})
