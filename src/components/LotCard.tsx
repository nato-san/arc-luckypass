import { useAccount } from 'wagmi'
import { Ticket, Users, Trophy, Lock } from 'lucide-react'
import { formatUsdc } from '@/onchain-money'
import { useLot, useHasEntered, useIsWinner, useEntrantCount, useEnter } from '@/hooks/useLuckyPass'
import { LOT_STATE_COLORS } from '@/lib/lot-constants'
import { useLocale } from '@/i18n/LocaleContext'
import { toast } from 'sonner'

interface LotCardProps {
  lotId: bigint
  onSelectLot: (lotId: bigint) => void
}

export function LotCard({ lotId, onSelectLot }: LotCardProps) {
  const { address } = useAccount()
  const { t } = useLocale()
  const { data: lot, isLoading } = useLot(lotId)
  const { data: entrantCount } = useEntrantCount(lotId)
  const { data: hasEntered, refetch: refetchEntered } = useHasEntered(lotId, address)
  const { data: isWinner } = useIsWinner(lotId, address)
  const { enter, isPending, isConfirming } = useEnter()

  if (isLoading || !lot) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse">
        <div className="h-4 bg-gray-100 rounded w-2/3 mb-3" />
        <div className="h-3 bg-gray-100 rounded w-full mb-2" />
        <div className="h-8 bg-gray-100 rounded w-full mt-4" />
      </div>
    )
  }

  const [name, description, priceUsdc, supply, , , stateNum, ticketsMinted] = lot
  const state = Number(stateNum)
  const price = formatUsdc(priceUsdc)
  const remaining = Number(supply) - Number(ticketsMinted)
  const isBusy = isPending || isConfirming

  // Translated state labels — use the state.N keys from translations
  const stateLabel = t(`state.${state}` as `state.${0 | 1 | 2 | 3 | 4}`) ?? 'UNKNOWN'

  const handleEnter = () => {
    if (!address) { toast.error(t('toast.connectFirst')); return }
    enter(lotId)
    toast.promise(
      new Promise<void>((res, rej) => {
        const check = () => {
          void refetchEntered().then(r => { if (r.data) { res() } else { setTimeout(check, 1500) } })
        }
        setTimeout(check, 2000)
        setTimeout(() => rej(new Error('timeout')), 30000)
      }),
      { loading: t('toast.enterLoading'), success: t('toast.enterSuccess'), error: t('toast.enterError') }
    )
  }

  return (
    <div
      className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer overflow-hidden"
      onClick={() => onSelectLot(lotId)}
    >
      {/* Header */}
      <div className="p-5 pb-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-semibold text-gray-900 text-base leading-snug">{name}</h3>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 ${LOT_STATE_COLORS[state] ?? 'bg-gray-100 text-gray-600'}`}>
            {stateLabel}
          </span>
        </div>
        <p className="text-sm text-gray-500 line-clamp-2">{description}</p>
      </div>

      {/* Stats */}
      <div className="px-5 pb-3 flex items-center gap-4 text-xs text-gray-500 flex-wrap">
        <span className="flex items-center gap-1">
          <Ticket size={12} /> {price} USDC
        </span>
        <span className="flex items-center gap-1">
          <Users size={12} /> {String(entrantCount ?? 0)} {t('lot.entrants')}
        </span>
        <span className="flex items-center gap-1">
          <Trophy size={12} />
          {t('lot.remaining')}{remaining}{t('lot.remainingUnit')}
        </span>
      </div>

      {/* Status badges */}
      {address && (
        <div className="px-5 pb-3 flex gap-2 flex-wrap">
          {hasEntered && (
            <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
              {t('lot.entered')}
            </span>
          )}
          {isWinner && state === 3 && (
            <span className="text-xs bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full font-medium">
              {t('lot.winner')}
            </span>
          )}
        </div>
      )}

      {/* Action */}
      <div className="px-5 pb-5" onClick={e => e.stopPropagation()}>
        {state === 0 && address && !hasEntered && (
          <button
            onClick={handleEnter}
            disabled={isBusy}
            className="w-full py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 active:scale-95 transition-all disabled:opacity-50"
          >
            {isBusy ? t('lot.processing') : t('lot.enterFree')}
          </button>
        )}
        {state === 3 && isWinner && (
          <button
            onClick={() => onSelectLot(lotId)}
            className="w-full py-2.5 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 active:scale-95 transition-all"
          >
            {t('lot.buyTicket')}
          </button>
        )}
        {state === 4 && (
          <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400 py-2">
            <Lock size={12} /> {t('lot.closed')}
          </div>
        )}
      </div>
    </div>
  )
}
