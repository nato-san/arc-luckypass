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
            url: typeof window !== 'undefined' ? window.location.origin : 'https://studio.arc.io',
            icons: [],
          },
          // showQrModal: false — ConnectKit がモーダル管理を担当する。
          // true にすると WC リレー切断時にモーダルが自動再表示されるループが起きる。
          showQrModal: false,
        }),
      ]
    : []),
]

export const config = createConfig({
  chains: [arcTestnet, mainnet], // mainnet needed for ENS resolution
  connectors,
  transports: {
    [arcTestnet.id]: http(),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
