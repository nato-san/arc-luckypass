import { useState, useEffect, useRef } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import {
  ArrowLeft, Check, AlertCircle, ExternalLink, Loader,
  RefreshCw, CheckCircle, Users, Trophy, Ticket, Lock,
  Calendar, Clock, WifiOff,
} from 'lucide-react'
import { formatUsdc } from '@/onchain-money'
import { CHAIN_ID, buildTxUrl } from '@/lib/chain-config'
import {
  useLot, useIsWinner, useUsdcAllowance, useApproveUsdc, usePurchase,
  useWinnerPurchaseState, useHasEntered, useEntrantCount, useEnter,
} from '@/hooks/useLuckyPass'
import { LUCKY_PASS_ADDRESS, LUCKY_PASS_ABI } from '@/lib/luckypass-abi'
import { TicketQR } from './TicketQR'
import { useLocale } from '@/i18n/LocaleContext'
import { LOT_STATE_COLORS } from '@/lib/lot-constants'
import { getLotImage, decodeDescription } from '@/lib/lot-images'
import { toast } from 'sonner'

// CHAIN_ID imported from chain-config

// VRF polling constants
const VRF_POLL_INTERVAL_MS  = 8_000   // check every 8 s while DRAWING/WORD_RECEIVED
const VRF_WARN_AFTER_MS     = 90_000  // show "taking longer than expected" after 90 s
const VRF_TIMEOUT_MS        = 300_000 // show manual-refresh hint after 5 min

interface PurchaseFlowProps {
  lotId: bigint
  onBack: () => void
}

export function PurchaseFlow({ lotId, onBack }: PurchaseFlowProps) {
  const { address } = useAccount()
  const { t, locale } = useLocale()
  const publicClient = usePublicClient({ chainId: CHAIN_ID })

  const { data: lot, refetch: refetchLot } = useLot(lotId)
  const { data: isWinner, refetch: refetchIsWinner } = useIsWinner(lotId, address)
  const { data: hasEntered, refetch: refetchEntered } = useHasEntered(lotId, address)
  const { data: entrantCount } = useEntrantCount(lotId)
  const { data: allowance, refetch: refetchAllowance } = useUsdcAllowance(address)
  const approve = useApproveUsdc()
  const purchase = usePurchase()
  const enter = useEnter()

  // VRF polling state
  const [vrfWaitMs, setVrfWaitMs] = useState(0)
  const vrfPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const vrfStartRef = useRef<number>(0)

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
      if (log.address.toLowerCase() === LUCKY_PASS_ADDRESS.toLowerCase()) {
        // ERC-721 Transfer(from=0x0, to=address, tokenId) has topics[1]=0x0
        if (log.topics.length === 4 &&
            log.topics[1] === '0x0000000000000000000000000000000000000000000000000000000000000000') {
          return BigInt(log.topics[3])
        }
      }
    }
    return null
  })()

  // On purchase success: capture tokenId + hash, then refetch purchase state
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

  // On approve success: refetch allowance immediately
  useEffect(() => {
    if (approve.isSuccess) void refetchAllowance()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approve.isSuccess])

  // On enter success: refetch hasEntered
  useEffect(() => {
    if (enter.isSuccess) void refetchEntered()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enter.isSuccess])

  // ── VRF polling — start when DRAWING or WORD_RECEIVED ────────────────────
  const stateNum = lot ? Number(lot[6]) : -1
  const isDrawingOrWord = stateNum === 1 || stateNum === 2

  useEffect(() => {
    if (!isDrawingOrWord) {
      // Stop polling when state changes
      if (vrfPollRef.current) {
        clearInterval(vrfPollRef.current)
        vrfPollRef.current = null
      }
      setVrfWaitMs(0)
      return
    }
    // Start polling
    vrfStartRef.current = Date.now()
    vrfPollRef.current = setInterval(() => {
      setVrfWaitMs(Date.now() - vrfStartRef.current)
      void refetchLot()
      void refetchIsWinner()
    }, VRF_POLL_INTERVAL_MS)

    return () => {
      if (vrfPollRef.current) {
        clearInterval(vrfPollRef.current)
        vrfPollRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDrawingOrWord])

  if (!lot) return null

  const [name, rawDescription, priceUsdc, supply, , , stateNumRaw, ticketsMintedBig, , entryOpenAtRaw, entryCloseAtRaw] = lot
  // Decode description: extract plain text (and image URL is handled via getLotImage below)
  const { text: description } = decodeDescription(rawDescription)
  const entryOpenAt  = Number(entryOpenAtRaw)
  const entryCloseAt = Number(entryCloseAtRaw)
  const state = Number(stateNumRaw)
  const price = priceUsdc
  const stateLabel = t(`state.${state}` as `state.${0 | 1 | 2 | 3 | 4}`) ?? 'UNKNOWN'
  const remaining = Number(supply) - Number(ticketsMintedBig)

  // ── Back button ───────────────────────────────────────────────────────────
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
          <WifiOff size={28} className="text-red-400" />
          <p className="text-sm text-red-700">{t('purchase.stateError')}</p>
          <button
            onClick={() => void refetchPurchaseState()}
            className="flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-800"
          >
            <RefreshCw size={14} /> {t('purchase.retry')}
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
  const lotImage = getLotImage(lotId, rawDescription)
  const LotHeader = () => (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4">
      {lotImage && (
        <div className="w-full bg-gray-50 flex items-center justify-center max-h-48 overflow-hidden">
          <img src={lotImage} alt={name} className="w-full object-cover max-h-48"
               onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
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
      {entryCloseAt > 0 && (
        <div className={`px-5 pb-4 flex flex-col gap-1 border-t border-gray-50 pt-3 text-xs ${entryClosed ? 'text-red-600' : !entryStarted ? 'text-amber-600' : 'text-emerald-600'}`}>
          <span className="flex items-center gap-1 font-medium">
            <Calendar size={12} />
            {entryClosed ? t('lot.entryClosed') : !entryStarted ? t('lot.entryNotYet') : t('lot.entryOpen')}
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

    // Error classification for enter
    const enterErrorText = (() => {
      if (!enter.error) return null
      const msg = enter.error.message
      if (msg.includes('User rejected') || msg.includes('user rejected')) return t('purchase.errUserRejected')
      if (msg.includes('AlreadyEntered')) return t('toast.enterError')
      return `${t('purchase.errGeneric')}: ${msg.slice(0, 80)}`
    })()

    const handleEnter = () => {
      if (!address) return
      enter.enter(lotId)
    }

    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <BackBtn />
        <LotHeader />
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          {/* Pending tx status */}
          {enter.isPending && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-xl text-sm text-amber-700">
              <Loader size={14} className="animate-spin shrink-0" />
              {t('op.txWalletApprove')}
            </div>
          )}
          {enter.isConfirming && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-xl text-sm text-amber-700">
              <Loader size={14} className="animate-spin shrink-0" />
              {t('op.txConfirming')}
            </div>
          )}

          {/* Success */}
          {enter.isSuccess && (
            <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-xl">
              <CheckCircle size={16} className="text-emerald-600 shrink-0" />
              <p className="text-sm text-emerald-700 font-medium">{t('lot.entered')}</p>
            </div>
          )}

          {/* Entered badge (from onchain) */}
          {!enter.isSuccess && address && hasEntered && (
            <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-xl">
              <CheckCircle size={16} className="text-emerald-600 shrink-0" />
              <p className="text-sm text-emerald-700 font-medium">{t('lot.entered')}</p>
            </div>
          )}

          {/* Not yet entered */}
          {!hasEntered && !enter.isSuccess && (
            <>
              {!address ? (
                <div className="flex flex-col items-center gap-3 py-2">
                  <p className="text-sm text-gray-600 text-center">{t('buyer.connectToEnter')}</p>
                  <ConnectKitButton />
                </div>
              ) : (
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

          {/* Enter error */}
          {enterErrorText && (
            <div className="flex items-start gap-2 p-3 bg-red-50 rounded-xl">
              <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{enterErrorText}</p>
            </div>
          )}

          {/* Tx explorer link */}
          {enter.hash && (
            <a
              href={buildTxUrl(enter.hash)}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800"
            >
              <ExternalLink size={12} /> {t('purchase.viewExplorer')}
            </a>
          )}
        </div>
      </div>
    )
  }

  // ── DRAWING / WORD_RECEIVED states — VRF polling ───────────────────────────
  if (state === 1 || state === 2) {
    const isLong    = vrfWaitMs >= VRF_WARN_AFTER_MS
    const isTimeout = vrfWaitMs >= VRF_TIMEOUT_MS

    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <BackBtn />
        <LotHeader />
        <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center space-y-3">
          {isTimeout ? (
            <Clock size={28} className="mx-auto text-gray-400" />
          ) : (
            <Loader size={28} className="mx-auto text-amber-500 animate-spin" />
          )}
          <p className="text-sm text-gray-600">{t('lot.entryWaiting')}</p>
          <p className="text-xs text-gray-400">
            {state === 1 ? t('lot.drawing') : t('lot.wordReceived')}
          </p>
          {address && hasEntered && (
            <p className="text-xs text-emerald-600 font-medium">{t('lot.entered')}</p>
          )}
          {/* Long wait warning */}
          {isLong && !isTimeout && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              {t('lot.drawingLong')}
            </p>
          )}
          {/* Timeout — show manual refresh */}
          {isTimeout && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                {t('lot.drawingTimeout')}
              </p>
              <button
                onClick={() => { void refetchLot(); void refetchIsWinner() }}
                className="flex items-center gap-1.5 text-xs text-violet-600 hover:text-violet-800 mx-auto"
              >
                <RefreshCw size={12} /> {t('purchase.retry')}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── ACTIVE state (state === 3) — winner purchase flow ─────────────────────
  if (!isWinner && !isAlreadyPurchased) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <BackBtn />
        <LotHeader />
        {!address ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-gray-600">{t('buyer.connectToBuy')}</p>
            <ConnectKitButton />
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-amber-100 p-6 text-center">
            <AlertCircle size={32} className="mx-auto mb-3 text-amber-500" />
            <p className="text-sm text-gray-700">{t('purchase.notWinner')}</p>
            <p className="text-xs text-gray-400 mt-1">{t('purchase.checkWallet')}</p>
          </div>
        )}
      </div>
    )
  }

  // ── Winner purchase form ───────────────────────────────────────────────────
  const hasAllowance = (allowance ?? 0n) >= price
  const priceFormatted = formatUsdc(price)
  const isApprovePending  = approve.isPending || approve.isConfirming
  const isPurchasePending = purchase.isPending || purchase.isConfirming

  // Approve error
  const approveErrorText = (() => {
    if (!approve.error) return null
    const msg = approve.error.message
    if (msg.includes('User rejected') || msg.includes('user rejected')) return t('purchase.errUserRejected')
    return `${t('purchase.errGeneric')}: ${msg.slice(0, 80)}`
  })()

  // Purchase error
  const purchaseErrorText = (() => {
    if (!purchase.error) return null
    const msg = purchase.error.message
    if (msg.includes('User rejected') || msg.includes('user rejected')) return t('purchase.errUserRejected')
    if (msg.includes('NotWinner'))        return t('purchase.errNotWinner')
    if (msg.includes('DeadlineExpired'))  return t('purchase.errDeadline')
    if (msg.includes('AlreadyPurchased')) return t('purchase.errAlready')
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('timeout')) return t('purchase.errNetwork')
    return `${t('purchase.errGeneric')}: ${msg.slice(0, 80)}`
  })()

  const handleApprove = () => {
    approve.approve(price)
  }

  const handlePurchase = async () => {
    if (!publicClient || !address) return

    // Pre-flight: verify onchain purchase state is still clean
    try {
      const freshLot = await publicClient.readContract({
        address: LUCKY_PASS_ADDRESS,
        abi: LUCKY_PASS_ABI,
        functionName: 'getLot',
        args: [lotId],
      }) as readonly unknown[]
      const freshState = Number(freshLot[6])
      if (freshState !== 3) {
        toast.error(t('purchase.errLotNotActive'))
        return
      }
    } catch {
      // RPC error on pre-flight: warn but allow proceed
      toast.warning(t('purchase.warnPreflightFailed'))
    }

    // Onchain check: already purchased?
    const fresh = await refetchPurchaseState()
    const freshData = fresh.data
    if (freshData && address) {
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
          toast.error(t('purchase.errAlready'))
          return
        }
      }
    }

    purchase.purchase(lotId)
  }

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

          {/* Approve status */}
          {approve.isPending && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg text-xs text-amber-700">
              <Loader size={12} className="animate-spin shrink-0" /> {t('op.txWalletApprove')}
            </div>
          )}
          {approve.isConfirming && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg text-xs text-amber-700">
              <Loader size={12} className="animate-spin shrink-0" /> {t('op.txConfirming')}
            </div>
          )}
          {approveErrorText && (
            <div className="flex items-start gap-2 px-3 py-2 bg-red-50 rounded-lg">
              <AlertCircle size={12} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{approveErrorText}</p>
            </div>
          )}

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

        {/* Purchase button — hidden once purchased */}
        {!isAlreadyPurchased && !purchase.isSuccess && (
          <div className="px-6 pb-6 space-y-3">
            <button
              onClick={() => void handlePurchase()}
              disabled={!hasAllowance || isPurchasePending || isPurchaseStateLoading}
              className="w-full py-3 rounded-xl bg-violet-600 text-white font-medium hover:bg-violet-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPurchasePending
                ? (purchase.isConfirming ? t('op.txConfirming') : t('purchase.ctaBuying'))
                : isPurchaseStateLoading
                  ? t('purchase.checkingState')
                  : !hasAllowance
                    ? t('purchase.ctaNeedApprove')
                    : `${priceFormatted} ${t('purchase.ctaBuy')}`}
            </button>

            {/* Purchase Tx status */}
            {purchase.isPending && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg text-xs text-amber-700">
                <Loader size={12} className="animate-spin shrink-0" /> {t('op.txWalletApprove')}
              </div>
            )}
            {purchase.isConfirming && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg text-xs text-amber-700">
                <Loader size={12} className="animate-spin shrink-0" /> {t('op.txConfirming')}
              </div>
            )}
          </div>
        )}

        {/* Already purchased badge */}
        {(isAlreadyPurchased || purchase.isSuccess) && (
          <div className="px-6 pb-6">
            <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-xl">
              <CheckCircle size={16} className="text-emerald-600 shrink-0" />
              <p className="text-sm text-emerald-700 font-medium">{t('purchase.alreadyPurchased')}</p>
            </div>
          </div>
        )}

        {/* Purchase error */}
        {purchaseErrorText && (
          <div className="px-6 pb-4">
            <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg">
              <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{purchaseErrorText}</p>
            </div>
          </div>
        )}

        {/* Tx explorer link — shown whenever we have a hash */}
        {purchase.hash && (
          <div className="px-6 pb-6">
            <a
              href={buildTxUrl(purchase.hash)}
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
