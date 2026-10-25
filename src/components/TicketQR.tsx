import { useState, useEffect } from 'react'
import { ExternalLink, Download } from 'lucide-react'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { generateQrDataUrl } from '@/lib/qr'
import { buildQrPayload, shortHash } from '@/lib/redemption-challenge'
import { LUCKY_PASS_ADDRESS } from '@/lib/luckypass-abi'
import { useTicketInfo } from '@/hooks/useLuckyPass'
import { useLocale } from '@/i18n/LocaleContext'

const CHAIN_ID = 5042002 as const

interface TicketQRProps {
  tokenId: bigint
  lotName: string
  purchaseTxHash?: `0x${string}`
}

export function TicketQR({ tokenId, lotName, purchaseTxHash }: TicketQRProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const { data: ticketInfo } = useTicketInfo(tokenId)
  const { t } = useLocale()

  useEffect(() => {
    const payload = buildQrPayload(LUCKY_PASS_ADDRESS, CHAIN_ID, tokenId)
    void generateQrDataUrl(payload).then(setQrDataUrl)
  }, [tokenId])

  const purchaseAmount = ticketInfo ? ticketInfo[3] : 0n
  const isRedeemed = ticketInfo ? ticketInfo[4] : false

  const handleDownload = () => {
    if (!qrDataUrl) return
    const a = document.createElement('a')
    a.href = qrDataUrl
    a.download = `luckypass-ticket-${tokenId}.png`
    a.click()
  }

  // Split the instruction string on "\n" for line breaks
  const instructionLines = t('qr.instruction').split('\n')

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-gray-50 text-center">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-100 mb-3">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M4 10l4 4 8-8" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">{t('qr.successTitle')}</h2>
        <p className="text-sm text-gray-500 mt-1">{lotName}</p>
      </div>

      {/* QR Code */}
      <div className="p-6 flex flex-col items-center gap-4">
        {qrDataUrl ? (
          <div className="border-4 border-gray-900 rounded-xl overflow-hidden">
            <img src={qrDataUrl} alt="Ticket QR Code" width={200} height={200} />
          </div>
        ) : (
          <div className="w-[200px] h-[200px] bg-gray-100 rounded-xl animate-pulse" />
        )}

        <p className="text-xs text-gray-400 text-center max-w-xs">
          {instructionLines.map((line, i) => (
            <span key={i}>{line}{i < instructionLines.length - 1 && <br />}</span>
          ))}
        </p>
      </div>

      {/* Ticket details */}
      <div className="px-6 pb-6 space-y-3">
        <div className="bg-gray-50 rounded-xl p-4 space-y-2.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">{t('qr.ticketNumber')}</span>
            <span className="font-mono text-gray-900 font-medium">#{String(tokenId)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">{t('qr.purchaseAmount')}</span>
            <span className="font-medium text-gray-900 tabular-nums">{(Number(purchaseAmount) / 1e6).toFixed(2)} USDC</span>
          </div>
          {purchaseTxHash && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-500 shrink-0">{t('qr.purchaseTx')}</span>
              <a
                href={buildTxExplorerUrl(CHAIN_ID, purchaseTxHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 font-mono text-blue-600 hover:text-blue-800 truncate"
              >
                {shortHash(purchaseTxHash)} <ExternalLink size={10} className="shrink-0" />
              </a>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-gray-500">{t('qr.status')}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isRedeemed ? 'bg-gray-100 text-gray-600' : 'bg-emerald-100 text-emerald-700'}`}>
              {isRedeemed ? t('qr.redeemed') : t('qr.unused')}
            </span>
          </div>
        </div>

        <button
          onClick={handleDownload}
          disabled={!qrDataUrl}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-40"
        >
          <Download size={14} /> {t('qr.saveButton')}
        </button>
      </div>
    </div>
  )
}
