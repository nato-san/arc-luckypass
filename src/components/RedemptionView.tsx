import { useState, useRef, useEffect, useCallback } from 'react'
import { useAccount } from 'wagmi'
import { ArrowLeft, Shield, CheckCircle, XCircle, Loader, Camera, Keyboard } from 'lucide-react'
import { arcTestnet } from 'viem/chains'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { parseSignedQrPayload, shortHash, shortAddress } from '@/lib/redemption-challenge'
import type { SignedQrPayload } from '@/lib/redemption-challenge'
import { LUCKY_PASS_ADDRESS } from '@/lib/luckypass-abi'
import { useTicketInfo, useLot, useIsVenueOperator, useRedeem } from '@/hooks/useLuckyPass'
import { useLocale } from '@/i18n/LocaleContext'
import { toast } from 'sonner'
import { BrowserQRCodeReader } from '@zxing/browser'

const CHAIN_ID = arcTestnet.id
const REDEMPTION_EXPIRY = 300 // must match contract

type InputMode = 'scan' | 'manual'
type Step = 'input' | 'confirm' | 'redeem' | 'done'

interface RedemptionViewProps {
  onBack: () => void
}

export function RedemptionView({ onBack }: RedemptionViewProps) {
  const { address } = useAccount()
  const { t } = useLocale()

  const [inputMode, setInputMode] = useState<InputMode>('scan')
  const [step, setStep] = useState<Step>('input')
  const [tokenId, setTokenId] = useState<bigint | undefined>()
  const [tokenIdInput, setTokenIdInput] = useState('')
  const [scannedPayload, setScannedPayload] = useState<SignedQrPayload | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000))

  const videoRef = useRef<HTMLVideoElement>(null)
  const readerRef = useRef<BrowserQRCodeReader | null>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)

  const { data: ticketInfo, refetch: refetchTicket } = useTicketInfo(tokenId)
  const { data: lot } = useLot(ticketInfo ? ticketInfo[0] : undefined)
  const { data: isOperator } = useIsVenueOperator(ticketInfo ? ticketInfo[0] : undefined, address)
  const redeem = useRedeem()

  // Keep nowSeconds current so signature validity re-evaluates every second
  useEffect(() => {
    const id = setInterval(() => {
      setNowSeconds(Math.floor(Date.now() / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // ── Camera management ──────────────────────────────────────────────────────

  const stopCamera = useCallback(() => {
    if (controlsRef.current) {
      controlsRef.current.stop()
      controlsRef.current = null
    }
    setIsScanning(false)
  }, [])

  // Start camera when scan tab is active and on input step
  useEffect(() => {
    if (inputMode !== 'scan' || step !== 'input') {
      stopCamera()
      return () => { stopCamera() }
    }
    let cancelled = false
    const reader = new BrowserQRCodeReader()
    readerRef.current = reader

    reader.decodeFromConstraints(
      { video: { facingMode: { ideal: 'environment' } } },
      videoRef.current!,
      (result, err, controls) => {
        if (cancelled) { controls.stop(); return }
        if (!controlsRef.current) {
          controlsRef.current = controls
          setIsScanning(true)
        }
        if (result) {
          const text = result.getText()
          const payload = parseSignedQrPayload(text)
          if (
            payload &&
            payload.contractAddress.toLowerCase() === LUCKY_PASS_ADDRESS.toLowerCase() &&
            payload.chainId === CHAIN_ID
          ) {
            controls.stop()
            controlsRef.current = null
            setIsScanning(false)
            setScannedPayload(payload)
            setTokenId(BigInt(payload.tokenId))
            setStep('confirm')
          }
        }
        // err here is just "no QR found yet" — ignore NotFoundException
        if (err && !err.message?.includes('NotFoundException') && !cancelled) {
          setCameraError(t('redeem.scanError'))
        }
      }
    ).catch(() => {
      if (!cancelled) setCameraError(t('redeem.scanError'))
    })

    return () => {
      cancelled = true
      stopCamera()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputMode, step])

  // ── Manual lookup ──────────────────────────────────────────────────────────

  const handleManualLookup = () => {
    try {
      const id = BigInt(tokenIdInput.trim())
      setTokenId(id)
      setScannedPayload(null)
      setStep('confirm')
    } catch {
      toast.error(t('toast.invalidTokenId'))
    }
  }

  // ── Signature validity check ───────────────────────────────────────────────

  const isSignatureValid = scannedPayload !== null &&
    nowSeconds <= Number(scannedPayload.timestamp) + REDEMPTION_EXPIRY

  // ── Redeem ─────────────────────────────────────────────────────────────────

  const handleRedeem = () => {
    if (tokenId === undefined || !scannedPayload) return
    const nonce = BigInt(scannedPayload.nonce)
    const timestamp = BigInt(scannedPayload.timestamp)
    redeem.redeem(tokenId, scannedPayload.signature, nonce, timestamp)
    toast.promise(
      new Promise<void>((res, rej) => {
        const check = () => {
          void refetchTicket().then(r => {
            if (r.data?.[4]) { res(); setStep('done') }
            else setTimeout(check, 1500)
          })
        }
        setTimeout(check, 2000)
        setTimeout(() => rej(new Error('timeout')), 45000)
      }),
      { loading: t('toast.redeemLoading'), success: t('toast.redeemSuccess'), error: t('toast.redeemError') }
    )
  }

  const redeemErrorText = (() => {
    if (!redeem.error) return null
    const msg = redeem.error.message
    if (msg.includes('ChallengeExpired'))  return t('redeem.errExpired')
    if (msg.includes('AlreadyRedeemed'))   return t('redeem.errAlready')
    if (msg.includes('NonceMismatch'))     return t('redeem.errNonce')
    if (msg.includes('InvalidSignature'))  return t('redeem.errSig')
    return `${t('redeem.errGeneric')}: ${msg.slice(0, 120)}`
  })()

  const reset = () => {
    setStep('input')
    setTokenId(undefined)
    setTokenIdInput('')
    setScannedPayload(null)
  }

  // ── Not connected ──────────────────────────────────────────────────────────

  if (!address) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 mb-6 hover:text-gray-700">
          <ArrowLeft size={16} /> {t('purchase.back')}
        </button>
        <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center text-sm text-gray-500">
          {t('redeem.connectPrompt')}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 mb-6 hover:text-gray-700">
        <ArrowLeft size={16} /> {t('purchase.back')}
      </button>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-gray-50">
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-violet-600" />
            <h2 className="font-semibold text-gray-900">{t('redeem.title')}</h2>
          </div>
          <p className="text-xs text-gray-500 mt-1">{t('redeem.subtitle')}</p>
        </div>

        {/* Step: Input (scan or manual) */}
        {step === 'input' && (
          <div>
            {/* Mode tabs */}
            <div className="flex border-b border-gray-100">
              <button
                onClick={() => setInputMode('scan')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors ${inputMode === 'scan' ? 'text-violet-700 border-b-2 border-violet-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Camera size={15} /> {t('redeem.scanTab')}
              </button>
              <button
                onClick={() => setInputMode('manual')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors ${inputMode === 'manual' ? 'text-violet-700 border-b-2 border-violet-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Keyboard size={15} /> {t('redeem.manualTab')}
              </button>
            </div>

            {inputMode === 'scan' ? (
              <div className="p-4 flex flex-col items-center gap-3">
                {cameraError ? (
                  <div className="w-full p-4 bg-amber-50 rounded-xl text-sm text-amber-700 text-center">
                    {cameraError}
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-gray-500">{t('redeem.scanHint')}</p>
                    <div className="relative w-full aspect-square bg-black rounded-xl overflow-hidden">
                      <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                      {isScanning && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-48 h-48 border-2 border-white/60 rounded-xl" />
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 flex items-center gap-1">
                      <Loader size={12} className="animate-spin" /> {t('redeem.scanning')}
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-1.5">{t('redeem.tokenIdLabel')}</label>
                  <input
                    type="number"
                    value={tokenIdInput}
                    onChange={e => setTokenIdInput(e.target.value)}
                    placeholder={t('redeem.tokenIdPlaceholder')}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <button
                  onClick={handleManualLookup}
                  disabled={!tokenIdInput}
                  className="w-full py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                >
                  {t('redeem.lookupButton')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Step: Confirm */}
        {step === 'confirm' && ticketInfo && lot && (
          <div className="p-6 space-y-4">
            <div className="bg-gray-50 rounded-xl p-4 space-y-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-500 shrink-0">{t('redeem.productName')}</span>
                <span className="font-medium text-gray-900 text-right">{lot[0]}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-500 shrink-0">{t('redeem.ticketNumber')}</span>
                <span className="font-mono text-gray-900 font-medium">#{String(tokenId)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-500 shrink-0">{t('redeem.purchaseAmount')}</span>
                <span className="tabular-nums font-medium text-gray-900">{(Number(ticketInfo[3]) / 1e6).toFixed(2)} USDC</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-500 shrink-0">{t('redeem.buyerWallet')}</span>
                <span className="font-mono text-xs text-gray-700">{shortAddress(ticketInfo[2])}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-500 shrink-0">{t('redeem.redeemStatus')}</span>
                {ticketInfo[4] ? (
                  <span className="flex items-center gap-1 text-xs text-red-600">
                    <XCircle size={14} /> {t('redeem.redeemed')}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-emerald-600">
                    <CheckCircle size={14} /> {t('redeem.unused')}
                  </span>
                )}
              </div>
            </div>

            {ticketInfo[4] ? (
              <div className="p-3 bg-red-50 rounded-xl text-sm text-red-700 text-center">
                {t('redeem.alreadyRedeemed')}
              </div>
            ) : !isOperator ? (
              <div className="p-3 bg-amber-50 rounded-xl text-sm text-amber-700 text-center">
                {t('redeem.notOperator')}
              </div>
            ) : !scannedPayload ? (
              <div className="p-3 bg-amber-50 rounded-xl text-sm text-amber-700 text-center">
                {t('redeem.signInstruction')}
              </div>
            ) : !isSignatureValid ? (
              <div className="p-3 bg-amber-50 rounded-xl text-sm text-amber-700 text-center">
                {t('redeem.errExpired')}
              </div>
            ) : (
              <>
                <div className="p-3 bg-emerald-50 rounded-xl flex items-center gap-2">
                  <CheckCircle size={16} className="text-emerald-600 shrink-0" />
                  <p className="text-sm text-emerald-700">{t('redeem.signedReady')}</p>
                </div>
                <button
                  onClick={() => setStep('redeem')}
                  className="w-full py-2.5 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 active:scale-95 transition-all"
                >
                  {t('redeem.redeemButton')}
                </button>
              </>
            )}

            <button
              onClick={reset}
              className="w-full py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              {t('redeem.anotherTicket')}
            </button>
          </div>
        )}

        {/* Step: Redeem (send tx) */}
        {step === 'redeem' && (
          <div className="p-6 space-y-4">
            <div className="p-3 bg-emerald-50 rounded-xl flex items-center gap-2">
              <CheckCircle size={16} className="text-emerald-600 shrink-0" />
              <p className="text-sm text-emerald-700">{t('redeem.signedReady')}</p>
            </div>
            <button
              onClick={handleRedeem}
              disabled={redeem.isPending || redeem.isConfirming}
              className="w-full py-3 rounded-xl bg-violet-600 text-white font-medium hover:bg-violet-700 active:scale-95 transition-all disabled:opacity-50"
            >
              {redeem.isPending || redeem.isConfirming
                ? t('redeem.redeemingButton')
                : t('redeem.redeemButton')}
            </button>
            {redeemErrorText && (
              <p className="text-xs text-red-600 bg-red-50 p-3 rounded-lg">{redeemErrorText}</p>
            )}
            <button onClick={() => setStep('confirm')} className="w-full py-2 text-sm text-gray-500 hover:text-gray-700">
              {t('purchase.back')}
            </button>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <div className="p-10 flex flex-col items-center gap-4 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle size={24} className="text-emerald-600" />
            </div>
            <h3 className="font-semibold text-gray-900">{t('redeem.doneTitle')}</h3>
            <p className="text-sm text-gray-500">{t('redeem.doneDesc')}</p>
            {redeem.hash && (
              <a
                href={buildTxExplorerUrl(CHAIN_ID, redeem.hash)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:text-blue-800 font-mono"
              >
                Tx: {shortHash(redeem.hash)}
              </a>
            )}
            <button
              onClick={reset}
              className="mt-2 text-sm text-gray-500 hover:text-gray-700"
            >
              {t('redeem.nextTicket')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
