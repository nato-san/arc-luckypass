import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { ArrowLeft, Check, AlertCircle, ExternalLink, Loader, RefreshCw, CheckCircle, Users, Trophy, Ticket, Lock, Calendar } from 'lucide-react'
import { formatUsdc } from '@/onchain-money'
import { arcTestnet } from 'viem/chains'
import { buildTxExplorerUrl } from '@/onchain-facts'
import {
  useLot, useIsWinner, useUsdcAllowance, useApproveUsdc, usePurchase,
  useWinnerPurchaseState, useHasEntered, useEntrantCount, useEnter,
} from '@/hooks/useLuckyPass'
import { TicketQR } from './TicketQR'
import { useLocale } from '@/i18n/LocaleContext'
import { LOT_STATE_COLORS } from '@/lib/lot-constants'
import { getLotImage } from '@/lib/lot-images'
import { toast } from 'sonner'

const CHAIN_ID = arcTestnet.id

interface PurchaseFlowProps {
  lotId: bigint
  onBack: () => void
}

export function PurchaseFlow({ lotId, onBack }: PurchaseFlowProps) {
  const { address } = useAccount()
  const { t, locale } = useLocale()
  const { data: lot } = useLot(lotId)
  const { data: isWinner } = useIsWinner(lotId, address)
  const { data: hasEntered, refetch: refetchEntered } = useHasEntered(lotId, address)
  const { data: entrantCount } = useEntrantCount(lotId)
  const { data: allowance, refetch: refetchAllowance } = useUsdcAllowance(address)
  const approve = useApproveUsdc()
  const purchase = usePurchase()
  const enter = useEnter()

  // ── Onchain purchase state ────────────────────────────────────────────────
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
      void refetchPurchaseState()
    }
    if (purchase.isSuccess && purchase.hash && !purchaseTxHash) {
      setPurchaseTxHash(purchase.hash)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivedMintedTokenId, purchase.isSuccess, purchase.hash])

  if (!lot) return null

  const [name, description, priceUsdc, supply, , , stateNum, ticketsMintedBig, , entryOpenAtRaw, entryCloseAtRaw] = lot
  const entryOpenAt  = Number(entryOpenAtRaw)   // 0 = open immediately
  const entryCloseAt = Number(entryCloseAtRaw)  // always > 0
  const state = Number(stateNum)
  const price = priceUsdc
  const stateLabel = t(`state.${state}` as `state.${0 | 1 | 2 | 3 | 4}`) ?? 'UNKNOWN'
  const remaining = Number(supply) - Number(ticketsMintedBig)

  // ── Back button — shared across all sub-views ─────────────────────────────
  const BackBtn = () => (
    <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 mb-6 hover:text-gray-700">
      <ArrowLeft size={16} /> {t('purchase.back')}
    </button>
  )

  // ── Show QR — either from this session or from onchain state ─────────────
  const displayTokenId = sessionTokenId ?? (isAlreadyPurchased ? existingTokenId : null)
  if (displayTokenId !== null) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <BackBtn />
        <TicketQR
          tokenId={displayTokenId}
          lotName={name}
          purchaseTxHash={purchaseTxHash}
        />
      </div>
    )
  }

  // ── Loading purchase state (only when tickets exist) ──────────────────────
  if (isPurchaseStateLoading && ticketsMinted > 0) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <BackBtn />
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
        <BackBtn />
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

  // ── Date formatter — JST for ja, UTC for en ──────────────────────────────
  const fmtDate = (unix: number) => {
    const d = new Date(unix * 1000)
    if (locale === 'ja') {
      return d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit' }) + ' JST'
    }
    return d.toLocaleString('en-US', { timeZone: 'UTC',
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit' }) + ' UTC'
  }

  const nowSec = Math.floor(Date.now() / 1000)
  const entryStarted = entryOpenAt === 0 || nowSec >= entryOpenAt
  const entryClosed  = entryCloseAt > 0 && nowSec >= entryCloseAt

  // ── Lot header — shown in all non-QR views ────────────────────────────────
  const lotImage = getLotImage(lotId)
  const LotHeader = () => (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4">
      {/* 商品画像 (localStorage から取得) */}
      {lotImage && (
        <div className="w-full bg-gray-50 flex items-center justify-center max-h-48 overflow-hidden">
          <img src={lotImage} alt={name} className="w-full object-cover max-h-48" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        </div>
      )}
      <div className="p-5 pb-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h2 className="text-xl font-semibold text-gray-900 leading-snug">{name}</h2>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 ${LOT_STATE_COLORS[state] ?? 'bg-gray-100 text-gray-600'}`}>
            {stateLabel}
          </span>
        </div>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
      <div className="px-5 pb-4 flex items-center gap-4 text-xs text-gray-500 flex-wrap border-t border-gray-50 pt-3">
        <span className="flex items-center gap-1"><Ticket size={12} /> {formatUsdc(price)} USDC</span>
        <span className="flex items-center gap-1"><Users size={12} /> {String(entrantCount ?? 0)} {t('lot.entrants')}</span>
        <span className="flex items-center gap-1">
          <Trophy size={12} />
          {t('lot.remaining')}{remaining}{t('lot.remainingUnit')}
        </span>
      </div>
      {/* 応募期間バナー */}
      {entryCloseAt > 0 && (
        <div className={`px-5 pb-4 flex flex-col gap-1 border-t border-gray-50 pt-3 text-xs ${entryClosed ? 'text-red-600' : !entryStarted ? 'text-amber-600' : 'text-emerald-600'}`}>
          <span className="flex items-center gap-1 font-medium">
            <Calendar size={12} />
            {entryClosed
              ? t('lot.entryClosed')
              : !entryStarted
                ? t('lot.entryNotYet')
                : t('lot.entryOpen')}
          </span>
          {entryOpenAt > 0 && (
            <span className="text-gray-400">{t('lot.entryFrom')}: {fmtDate(entryOpenAt)}</span>
          )}
          <span className="text-gray-400">{t('lot.entryUntil')}: {fmtDate(entryCloseAt)}</span>
        </div>
      )}
    </div>
  )

  // ── CLOSED state ──────────────────────────────────────────────────────────
  if (state === 4) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <BackBtn />
        <LotHeader />
        <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center text-gray-500 text-sm flex flex-col items-center gap-2">
          <Lock size={28} className="text-gray-300" />
          {t('lot.closed')}
        </div>
      </div>
    )
  }

  // ── OPEN state — entry phase ───────────────────────────────────────────────
  if (state === 0) {
    const isBusy = enter.isPending || enter.isConfirming

    const handleEnter = () => {
      if (!address) return
      enter.enter(lotId)
      toast.promise(
        new Promise<void>((res, rej) => {
          const check = () => {
            void refetchEntered().then(r => { if (r.data) res(); else setTimeout(check, 1500) })
          }
          setTimeout(check, 2000)
          setTimeout(() => rej(new Error('timeout')), 30000)
        }),
        { loading: t('toast.enterLoading'), success: t('toast.enterSuccess'), error: t('toast.enterError') }
      )
    }

    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <BackBtn />
        <LotHeader />
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          {/* Entered badge */}
          {address && hasEntered && (
            <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-xl">
              <CheckCircle size={16} className="text-emerald-600 shrink-0" />
              <p className="text-sm text-emerald-700 font-medium">{t('lot.entered')}</p>
            </div>
          )}

          {/* Not yet entered */}
          {!hasEntered && (
            <>
              {!address ? (
                /* Wallet not connected — show connect button */
                <div className="flex flex-col items-center gap-3 py-2">
                  <p className="text-sm text-gray-600 text-center">{t('buyer.connectToEnter')}</p>
                  <ConnectKitButton />
                </div>
              ) : (
                /* Connected, not entered — show enter button */
                <button
                  onClick={handleEnter}
                  disabled={isBusy}
                  className="w-full py-3 rounded-xl bg-gray-900 text-white font-medium hover:bg-gray-800 active:scale-95 transition-all disabled:opacity-50"
                >
                  {isBusy ? t('lot.processing') : t('lot.enterFree')}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  // ── DRAWING / WORD_RECEIVED states — waiting for result ───────────────────
  if (state === 1 || state === 2) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <BackBtn />
        <LotHeader />
        <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center space-y-3">
          <Loader size={28} className="mx-auto text-amber-500 animate-spin" />
          <p className="text-sm text-gray-600">
            {t('lot.entryWaiting')}
          </p>
          <p className="text-xs text-gray-400">
            {state === 1 ? t('lot.drawing') : t('lot.wordReceived')}
          </p>
          {address && hasEntered && (
            <p className="text-xs text-emerald-600 font-medium">{t('lot.entered')}</p>
          )}
        </div>
      </div>
    )
  }

  // ── ACTIVE state (state === 3) — winner purchase flow ─────────────────────
  // Not a winner and ticket not already purchased
  if (!isWinner && !isAlreadyPurchased) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <BackBtn />
        <LotHeader />

        {/* Wallet not connected */}
        {!address && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-gray-600">{t('buyer.connectToBuy')}</p>
            <ConnectKitButton />
          </div>
        )}

        {/* Connected but not a winner */}
        {address && (
          <div className="bg-white rounded-2xl border border-amber-100 p-6 text-center">
            <AlertCircle size={32} className="mx-auto mb-3 text-amber-500" />
            <p className="text-sm text-gray-700">{t('purchase.notWinner')}</p>
            <p className="text-xs text-gray-400 mt-1">{t('purchase.checkWallet')}</p>
          </div>
        )}
      </div>
    )
  }

  // Winner purchase form
  const hasAllowance = (allowance ?? 0n) >= price
  const priceFormatted = formatUsdc(price)
  const isApprovePending = approve.isPending || approve.isConfirming
  const isPurchasePending = purchase.isPending || purchase.isConfirming

  const handleApprove = () => {
    approve.approve(price)
    toast.promise(
      new Promise<void>((res) => {
        const check = () => { void refetchAllowance().then(r => { if ((r.data ?? 0n) >= price) res(); else setTimeout(check, 1500) }) }
        setTimeout(check, 2000)
      }),
      { loading: t('toast.approveLoading'), success: t('toast.approveSuccess'), error: t('toast.approveError') }
    )
  }

  const handlePurchase = async () => {
    const fresh = await refetchPurchaseState()
    const freshData = fresh.data
    let freshlyPurchased = false
    if (freshData && address && lotId !== undefined) {
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
    if (freshlyPurchased) { toast.error(t('purchase.errAlready')); return }
    purchase.purchase(lotId)
  }

  const purchaseErrorText = (() => {
    if (!purchase.error) return null
    const msg = purchase.error.message
    if (msg.includes('NotWinner'))        return t('purchase.errNotWinner')
    if (msg.includes('DeadlineExpired'))  return t('purchase.errDeadline')
    if (msg.includes('AlreadyPurchased')) return t('purchase.errAlready')
    return `${t('purchase.errGeneric')}: ${msg.slice(0, 80)}`
  })()

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <BackBtn />
      <LotHeader />

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-50">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">{t('purchase.heading')}</p>
          <div className="flex items-center gap-2">
            <Trophy size={16} className="text-violet-500" />
            <span className="text-sm font-semibold text-violet-700">{t('lot.winner')}</span>
          </div>
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

          {isAlreadyPurchased && existingTokenId !== null && (
            <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-xl">
              <CheckCircle size={16} className="text-emerald-600 shrink-0" />
              <p className="text-sm text-emerald-700 font-medium">{t('purchase.alreadyPurchased')}</p>
            </div>
          )}
        </div>

        {purchaseErrorText && (
          <div className="px-6 pb-6">
            <p className="text-xs text-red-600 bg-red-50 p-3 rounded-lg">{purchaseErrorText}</p>
          </div>
        )}

        {purchase.hash && !purchase.isSuccess && (
          <div className="px-6 pb-6">
            <a
              href={buildTxExplorerUrl(CHAIN_ID, purchase.hash)}
              target="_blank" rel="noopener noreferrer"
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
