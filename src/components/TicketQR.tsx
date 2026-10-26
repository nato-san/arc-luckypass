import { useState, useEffect, useCallback } from 'react'
import { useSignTypedData } from 'wagmi'
import { ExternalLink, Download, RefreshCw } from 'lucide-react'
import { arcTestnet } from 'viem/chains'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { generateQrDataUrl } from '@/lib/qr'
import {
  buildRedemptionDomain,
  REDEMPTION_TYPES,
  buildRedemptionMessage,
  buildSignedQrPayload,
  shortHash,
} from '@/lib/redemption-challenge'
import { LUCKY_PASS_ADDRESS } from '@/lib/luckypass-abi'
import { useTicketInfo, useRedemptionNonce } from '@/hooks/useLuckyPass'
import { useLocale } from '@/i18n/LocaleContext'
import { toast } from 'sonner'

const CHAIN_ID = arcTestnet.id
const REDEMPTION_EXPIRY = 300 // seconds — must match contract

interface TicketQRProps {
  tokenId: bigint
  lotName: string
  purchaseTxHash?: `0x${string}`
}

export function TicketQR({ tokenId, lotName, purchaseTxHash }: TicketQRProps) {
  const { t } = useLocale()
  const { signTypedDataAsync } = useSignTypedData()

  const { data: ticketInfo } = useTicketInfo(tokenId)
  const { data: nonce, refetch: refetchNonce } = useRedemptionNonce(tokenId)

  // Signed QR state
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [signedAt, setSignedAt] = useState<number | null>(null) // Unix seconds
  const [secondsLeft, setSecondsLeft] = useState<number>(0)
  const [isSigning, setIsSigning] = useState(false)

  const purchaseAmount = ticketInfo ? ticketInfo[3] : 0n
  const isRedeemed = ticketInfo ? ticketInfo[4] : false

  // Countdown timer
  useEffect(() => {
    if (signedAt === null) return
    const interval = setInterval(() => {
      const remaining = REDEMPTION_EXPIRY - (Math.floor(Date.now() / 1000) - signedAt)
      if (remaining <= 0) {
        setSecondsLeft(0)
        setQrDataUrl(null)
        setSignedAt(null)
        clearInterval(interval)
      } else {
        setSecondsLeft(remaining)
      }
    }, 500)
    return () => clearInterval(interval)
  }, [signedAt])

  const handleSign = useCallback(async () => {
    if (nonce === undefined) return
    setIsSigning(true)
    try {
      // Refresh nonce just before signing to avoid stale-nonce mismatch
      const { data: freshNonce } = await refetchNonce()
      const currentNonce = freshNonce ?? nonce
      const ts = BigInt(Math.floor(Date.now() / 1000))
      const domain = buildRedemptionDomain(LUCKY_PASS_ADDRESS, CHAIN_ID)
      const message = buildRedemptionMessage(tokenId, LUCKY_PASS_ADDRESS, CHAIN_ID, currentNonce, ts)
      const sig = await signTypedDataAsync({
        domain,
        types: REDEMPTION_TYPES,
        primaryType: 'RedemptionChallenge',
        message,
      })
      const payload = buildSignedQrPayload(LUCKY_PASS_ADDRESS, CHAIN_ID, tokenId, sig, currentNonce, ts)
      const dataUrl = await generateQrDataUrl(payload)
      setQrDataUrl(dataUrl)
      setSignedAt(Number(ts))
      setSecondsLeft(REDEMPTION_EXPIRY)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('cancelled')) {
        toast.info(t('toast.sigCancelled'))
      } else {
        toast.error(t('toast.sigError'))
      }
    } finally {
      setIsSigning(false)
    }
  }, [nonce, refetchNonce, tokenId, signTypedDataAsync, t])

  const handleDownload = () => {
    if (!qrDataUrl) return
    const a = document.createElement('a')
    a.href = qrDataUrl
    a.download = `luckypass-ticket-${tokenId}.png`
    a.click()
  }

  const isExpired = signedAt !== null && secondsLeft === 0

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

      <div className="p-6 flex flex-col items-center gap-4">
        {isRedeemed ? (
          <div className="w-full p-4 bg-gray-50 rounded-xl text-center text-sm text-gray-500">
            {t('qr.alreadyRedeemed')}
          </div>
        ) : qrDataUrl && !isExpired ? (
          <>
            {/* Signed QR with countdown */}
            <p className="text-xs font-medium text-violet-700">{t('qr.signedTitle')}</p>
            <div className="relative">
              <div className="border-4 border-violet-600 rounded-xl overflow-hidden">
                <img src={qrDataUrl} alt="Signed Ticket QR Code" width={200} height={200} />
              </div>
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-violet-600 text-white text-xs px-2 py-0.5 rounded-full whitespace-nowrap">
                {t('qr.expiresIn')} {secondsLeft}{t('qr.expiresUnit')}
              </div>
            </div>
            <p className="text-xs text-gray-400 text-center mt-2">
              {t('qr.instruction').split('\n').map((line, i, arr) => (
                <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
              ))}
            </p>
          </>
        ) : (
          <>
            {/* Pre-sign or expired state */}
            {isExpired && (
              <p className="text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg">
                {t('qr.expiredBadge')}
              </p>
            )}
            <p className="text-xs text-gray-400 text-center max-w-xs">
              {t('qr.signHint')}
            </p>
            <button
              onClick={() => { void handleSign() }}
              disabled={isSigning || nonce === undefined}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 active:scale-95 transition-all disabled:opacity-50"
            >
              <RefreshCw size={14} className={isSigning ? 'animate-spin' : ''} />
              {isSigning ? t('qr.signingButton') : t('qr.signButton')}
            </button>
          </>
        )}
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

        {qrDataUrl && !isExpired && !isRedeemed && (
          <button
            onClick={handleDownload}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 active:scale-95 transition-all"
          >
            <Download size={14} /> {t('qr.saveButton')}
          </button>
        )}
      </div>
    </div>
  )
}
