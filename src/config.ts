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
import { arcTestnet } from 'viem/chains'
import { injected, coinbaseWallet, walletConnect } from 'wagmi/connectors'
import { registerChain } from './tracing'

// Explicit RPC URLs — wagmi requires a non-empty transport to resolve chain objects
const ARC_TESTNET_RPC = arcTestnet.rpcUrls.default.http[0]  // https://rpc.testnet.arc.io

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])

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
  chains: [arcTestnet, mainnet], // mainnet needed for ENS resolution
  connectors,
  transports: {
    [arcTestnet.id]: http(ARC_TESTNET_RPC),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
