import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { ArrowLeft, Check, AlertCircle, ExternalLink, Loader, RefreshCw, CheckCircle } from 'lucide-react'
import { formatUsdc } from '@/onchain-money'
import { arcTestnet } from 'viem/chains'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { useLot, useIsWinner, useUsdcAllowance, useApproveUsdc, usePurchase, useWinnerPurchaseState } from '@/hooks/useLuckyPass'
import { TicketQR } from './TicketQR'
import { useLocale } from '@/i18n/LocaleContext'
import { toast } from 'sonner'

const CHAIN_ID = arcTestnet.id

interface PurchaseFlowProps {
  lotId: bigint
  onBack: () => void
}

export function PurchaseFlow({ lotId, onBack }: PurchaseFlowProps) {
  const { address } = useAccount()
  const { t } = useLocale()
  const { data: lot } = useLot(lotId)
  const { data: isWinner } = useIsWinner(lotId, address)
  const { data: allowance, refetch: refetchAllowance } = useUsdcAllowance(address)
  const approve = useApproveUsdc()
  const purchase = usePurchase()

  // ── Onchain purchase state ────────────────────────────────────────────────
  // ticketsMinted from lot[7] tells us how many tokens exist so we know how
  // many ownerOf() calls to batch. Cap at 500 (MAX_ENTRANTS) for safety.
  const ticketsMinted = lot ? Math.min(Number(lot[7]), 500) : 0
  const {
    isPurchased: isAlreadyPurchased,
    tokenId: existingTokenId,
    isLoading: isPurchaseStateLoading,
    isError: isPurchaseStateError,
    refetch: refetchPurchaseState,
  } = useWinnerPurchaseState(lotId, address, ticketsMinted)

  // tokenId from this session's Tx receipt (newly minted)
  const [sessionTokenId, setSessionTokenId] = useState<bigint | null>(null)
  const [purchaseTxHash, setPurchaseTxHash] = useState<`0x${string}` | undefined>()

  // Derive tokenId from receipt logs on success
  const derivedMintedTokenId: bigint | null = (() => {
    if (!purchase.isSuccess || !purchase.receipt) return null
    for (const log of purchase.receipt.logs) {
      if (log.address.toLowerCase() === '0xab7678c528f1d517d642c13e3fd97124a743abe8') {
        if (log.topics.length === 4 &&
            log.topics[1] === '0x0000000000000000000000000000000000000000000000000000000000000000') {
          return BigInt(log.topics[3])
        }
      }
    }
    return null
  })()

  useEffect(() => {
    if (derivedMintedTokenId !== null && sessionTokenId === null) {
      setSessionTokenId(derivedMintedTokenId)
      // Refresh onchain state after purchase so re-visit shows purchased state
      void refetchPurchaseState()
    }
    if (purchase.isSuccess && purchase.hash && !purchaseTxHash) {
      setPurchaseTxHash(purchase.hash)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivedMintedTokenId, purchase.isSuccess, purchase.hash])

  if (!lot) return null

  const [name, , , , , , stateNum] = lot
  const state = Number(stateNum)

  if (state !== 3) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 mb-6 hover:text-gray-700">
          <ArrowLeft size={16} /> {t('purchase.back')}
        </button>
        <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center text-gray-500 text-sm">
          {t('purchase.notActive')}
        </div>
      </div>
    )
  }

  if (!isWinner) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 mb-6 hover:text-gray-700">
          <ArrowLeft size={16} /> {t('purchase.back')}
        </button>
        <div className="bg-white rounded-2xl border border-amber-100 p-6 text-center">
          <AlertCircle size={32} className="mx-auto mb-3 text-amber-500" />
          <p className="text-sm text-gray-700">{t('purchase.notWinner')}</p>
          <p className="text-xs text-gray-400 mt-1">{t('purchase.checkWallet')}</p>
        </div>
      </div>
    )
  }

  // ── Show QR — either from this session or from onchain state ─────────────
  const displayTokenId = sessionTokenId ?? (isAlreadyPurchased ? existingTokenId : null)
  if (displayTokenId !== null) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 mb-6 hover:text-gray-700">
          <ArrowLeft size={16} /> {t('purchase.backToList')}
        </button>
        <TicketQR
          tokenId={displayTokenId}
          lotName={name}
          purchaseTxHash={purchaseTxHash}
        />
      </div>
    )
  }

  // ── Loading purchase state ────────────────────────────────────────────────
  if (isPurchaseStateLoading && ticketsMinted > 0) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 mb-6 hover:text-gray-700">
          <ArrowLeft size={16} /> {t('purchase.back')}
        </button>
        <div className="bg-white rounded-2xl border border-gray-100 p-8 flex flex-col items-center gap-3 text-sm text-gray-500">
          <Loader size={20} className="animate-spin text-violet-500" />
          {t('purchase.checkingState')}
        </div>
      </div>
    )
  }

  // ── Onchain state fetch error ─────────────────────────────────────────────
  if (isPurchaseStateError && ticketsMinted > 0) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 mb-6 hover:text-gray-700">
          <ArrowLeft size={16} /> {t('purchase.back')}
        </button>
        <div className="bg-white rounded-2xl border border-red-100 p-6 flex flex-col items-center gap-4 text-center">
          <AlertCircle size={28} className="text-red-400" />
          <p className="text-sm text-red-700">{t('purchase.stateError')}</p>
          <button
            onClick={() => void refetchPurchaseState()}
            className="flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-800"
          >
            <RefreshCw size={14} /> {t('purchase.back')}
          </button>
        </div>
      </div>
    )
  }

  // ── Purchase flow ─────────────────────────────────────────────────────────
  const price = lot ? lot[2] : 0n
  const hasAllowance = (allowance ?? 0n) >= price
  const priceFormatted = formatUsdc(price)
  const isApprovePending = approve.isPending || approve.isConfirming
  const isPurchasePending = purchase.isPending || purchase.isConfirming

  const handleApprove = () => {
    approve.approve(price)
    toast.promise(
      new Promise<void>((res) => {
        const check = () => { void refetchAllowance().then(r => { if ((r.data ?? 0n) >= price) { res() } else { setTimeout(check, 1500) } }) }
        setTimeout(check, 2000)
      }),
      { loading: t('toast.approveLoading'), success: t('toast.approveSuccess'), error: t('toast.approveError') }
    )
  }

  const handlePurchase = async () => {
    // Fetch the latest onchain state and evaluate it directly from the Promise
    // result — never rely on React re-render to update isAlreadyPurchased first.
    const fresh = await refetchPurchaseState()
    // fresh.data is the raw useReadContracts array; derive isPurchased from it.
    const freshData = fresh.data
    let freshlyPurchased = false
    if (freshData && address && lotId !== undefined) {
      // Same interleaved layout as useWinnerPurchaseState: 2*i = ownerOf, 2*i+1 = tokenLot
      const count = freshData.length / 2
      for (let i = 0; i < count; i++) {
        const ownerR = freshData[2 * i]
        const lotR   = freshData[2 * i + 1]
        if (
          ownerR?.status === 'success' &&
          typeof ownerR.result === 'string' &&
          ownerR.result.toLowerCase() === address.toLowerCase() &&
          lotR?.status === 'success' &&
          typeof lotR.result === 'bigint' &&
          lotR.result === lotId
        ) {
          freshlyPurchased = true
          break
        }
      }
    }
    if (freshlyPurchased) {
      toast.error(t('purchase.errAlready'))
      return
    }
    purchase.purchase(lotId)
  }

  // Map contract error messages to translated strings
  const purchaseErrorText = (() => {
    if (!purchase.error) return null
    const msg = purchase.error.message
    if (msg.includes('NotWinner'))       return t('purchase.errNotWinner')
    if (msg.includes('DeadlineExpired')) return t('purchase.errDeadline')
    if (msg.includes('AlreadyPurchased')) return t('purchase.errAlready')
    return `${t('purchase.errGeneric')}: ${msg.slice(0, 80)}`
  })()

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 mb-6 hover:text-gray-700">
        <ArrowLeft size={16} /> {t('purchase.back')}
      </button>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-50">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">{t('purchase.heading')}</p>
          <h2 className="text-xl font-semibold text-gray-900">{name}</h2>
        </div>

        {/* Price */}
        <div className="p-6 border-b border-gray-50">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">{t('purchase.amount')}</span>
            <span className="text-2xl font-bold text-gray-900 tabular-nums">
              {priceFormatted} <span className="text-base font-normal text-gray-500">USDC</span>
            </span>
          </div>
        </div>

        {/* Steps */}
        <div className="p-6 space-y-3">
          {/* Step 1: Approve */}
          <div className={`flex items-center gap-3 p-3 rounded-xl ${hasAllowance ? 'bg-emerald-50' : 'bg-gray-50'}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${hasAllowance ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
              {hasAllowance ? <Check size={12} /> : '1'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">{t('purchase.step1Label')}</p>
              <p className="text-xs text-gray-500">{t('purchase.step1Desc')} {priceFormatted} USDC {t('purchase.step1DescPost')}</p>
            </div>
            {!hasAllowance && (
              <button
                onClick={handleApprove}
                disabled={isApprovePending}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 shrink-0"
              >
                {isApprovePending ? t('purchase.approving') : t('purchase.approve')}
              </button>
            )}
          </div>

          {/* Step 2: Purchase */}
          <div className={`flex items-center gap-3 p-3 rounded-xl ${purchase.isSuccess ? 'bg-emerald-50' : 'bg-gray-50'}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${purchase.isSuccess ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
              {purchase.isSuccess ? <Check size={12} /> : '2'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">{t('purchase.step2Label')}</p>
              <p className="text-xs text-gray-500">{t('purchase.step2Desc')}</p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="px-6 pb-6 space-y-3">
          <button
            onClick={() => void handlePurchase()}
            disabled={!hasAllowance || isPurchasePending || isPurchaseStateLoading}
            className="w-full py-3 rounded-xl bg-violet-600 text-white font-medium hover:bg-violet-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPurchasePending
              ? t('purchase.ctaBuying')
              : isPurchaseStateLoading
                ? t('purchase.checkingState')
                : !hasAllowance
                  ? t('purchase.ctaNeedApprove')
                  : `${priceFormatted} ${t('purchase.ctaBuy')}`}
          </button>

          {/* Purchased indicator — shown while still on this screen */}
          {isAlreadyPurchased && existingTokenId !== null && (
            <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-xl">
              <CheckCircle size={16} className="text-emerald-600 shrink-0" />
              <p className="text-sm text-emerald-700 font-medium">{t('purchase.alreadyPurchased')}</p>
            </div>
          )}
        </div>

        {/* Error display */}
        {purchaseErrorText && (
          <div className="px-6 pb-6">
            <p className="text-xs text-red-600 bg-red-50 p-3 rounded-lg">{purchaseErrorText}</p>
          </div>
        )}

        {purchase.hash && !purchase.isSuccess && (
          <div className="px-6 pb-6">
            <a
              href={buildTxExplorerUrl(CHAIN_ID, purchase.hash)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800"
            >
              <ExternalLink size={12} /> {t('purchase.viewExplorer')}
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
