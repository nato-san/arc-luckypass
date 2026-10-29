import { useLotCount } from '@/hooks/useLuckyPass'
import { LotCard } from './LotCard'
import { Ticket } from 'lucide-react'
import { useLocale } from '@/i18n/LocaleContext'

interface LotGridProps {
  onSelectLot: (lotId: bigint) => void
}

// LotGrid works even when the wallet is not connected — lot info is public.
// The connect prompt appears inside each LotCard for actions that need a wallet.
export function LotGrid({ onSelectLot }: LotGridProps) {
  const { data: lotCount, isLoading } = useLotCount()
  const { t } = useLocale()

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[0, 1].map(i => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 h-40 animate-pulse" />
        ))}
      </div>
    )
  }

  const count = Number(lotCount ?? 0n)

  if (count === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <Ticket size={36} className="mx-auto mb-3 opacity-40" />
        <p className="text-sm">{t('lot.noLots')}</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {Array.from({ length: count }, (_, i) => BigInt(i + 1)).map(lotId => (
        <LotCard key={String(lotId)} lotId={lotId} onSelectLot={onSelectLot} />
      ))}
    </div>
  )
}
