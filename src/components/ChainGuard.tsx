/**
 * ChainGuard — Arc Testnet network enforcement UI.
 *
 * Shows a prominent banner (not a full-page block) when the connected wallet
 * is on the wrong chain. The "Switch" button calls wagmi's useSwitchChain,
 * which issues wallet_switchEthereumChain first. If the wallet returns error
 * code 4902 (chain not added), wagmi automatically follows up with
 * wallet_addEthereumChain so MetaMask prompts the user to add Arc Testnet.
 *
 * If the wallet rejects the switch (user cancels or wallet errors), a clear
 * Japanese/English error message is shown inline — no crash, no silent failure.
 */

import { useState } from 'react'
import { useSwitchChain, useAccount } from 'wagmi'
import { CHAIN_ID as ACTIVE_CHAIN_ID } from '@/lib/chain-config'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useLocale } from '../i18n/LocaleContext'

export function ChainGuard() {
  const { chainId, isConnected } = useAccount()
  const { switchChain, isPending } = useSwitchChain()
  const { t } = useLocale()
  const [switchError, setSwitchError] = useState<string | null>(null)

  // Nothing to show when not connected or already on Arc Testnet
  if (!isConnected || chainId === ACTIVE_CHAIN_ID) return null

  const handleSwitch = () => {
    setSwitchError(null)
    switchChain(
      { chainId: ACTIVE_CHAIN_ID },
      {
        onError(err) {
          // 4001 = user rejected; 4902 = chain not added (wagmi auto-retries)
          const code = (err as { code?: number }).code
          if (code === 4001) {
            setSwitchError(t('network.switchRejected'))
          } else {
            setSwitchError(t('network.switchError') + (err.message ? ` (${err.message.slice(0, 80)})` : ''))
          }
        },
      },
    )
  }

  return (
    <div className="bg-amber-50 border-b border-amber-200">
      <div className="max-w-2xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Icon + text */}
        <div className="flex items-start gap-2 min-w-0">
          <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-900">
              {t('network.wrongNetwork')}
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              {t('network.addOrSwitchHint')}
            </p>
            {switchError && (
              <p className="text-xs text-red-700 mt-1 font-medium">{switchError}</p>
            )}
          </div>
        </div>

        {/* Switch button */}
        <button
          onClick={handleSwitch}
          disabled={isPending}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-xs font-semibold transition-colors"
        >
          <RefreshCw size={12} className={isPending ? 'animate-spin' : ''} />
          {isPending ? t('network.switching') : t('network.switchButton')}
        </button>
      </div>
    </div>
  )
}
