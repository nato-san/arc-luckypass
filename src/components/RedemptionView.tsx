import { useState } from 'react'
import { useAccount, useSignTypedData } from 'wagmi'
import { ArrowLeft, Shield, CheckCircle, XCircle, Loader } from 'lucide-react'
import { arcTestnet } from 'viem/chains'
import { buildTxExplorerUrl } from '@/onchain-facts'
import {
  buildRedemptionDomain,
  REDEMPTION_TYPES,
  buildRedemptionMessage,
  shortHash,
  shortAddress,
} from '@/lib/redemption-challenge'
import { LUCKY_PASS_ADDRESS } from '@/lib/luckypass-abi'
import { useTicketInfo, useRedemptionNonce, useLot, useIsVenueOperator, useRedeem } from '@/hooks/useLuckyPass'
import { useLocale } from '@/i18n/LocaleContext'
import { toast } from 'sonner'

const CHAIN_ID = arcTestnet.id

interface RedemptionViewProps {
  onBack: () => void
}

export function RedemptionView({ onBack }: RedemptionViewProps) {
  const { address } = useAccount()
  const { t } = useLocale()
  const [tokenIdInput, setTokenIdInput] = useState('')
  const [tokenId, setTokenId] = useState<bigint | undefined>()
  const [step, setStep] = useState<'lookup' | 'confirm' | 'sign' | 'redeem' | 'done'>('lookup')
  const [signature, setSignature] = useState<`0x${string}` | undefined>()
  const [challengeTimestamp, setChallengeTimestamp] = useState<bigint>(0n)

  const { data: ticketInfo, refetch: refetchTicket } = useTicketInfo(tokenId)
  const { data: nonce } = useRedemptionNonce(tokenId)
  const { data: lot } = useLot(ticketInfo ? ticketInfo[0] : undefined)
  const { data: isOperator } = useIsVenueOperator(ticketInfo ? ticketInfo[0] : undefined, address)
  const { signTypedDataAsync } = useSignTypedData()
  const redeem = useRedeem()

  const handleLookup = () => {
    try {
      const id = BigInt(tokenIdInput.trim())
      setTokenId(id)
      setStep('confirm')
    } catch {
      toast.error(t('toast.invalidTokenId'))
    }
  }

  const handleSign = async () => {
    if (!address || tokenId === undefined || nonce === undefined) return
    setStep('sign')
    try {
      const ts = BigInt(Math.floor(Date.now() / 1000))
      setChallengeTimestamp(ts)
      const domain = buildRedemptionDomain(LUCKY_PASS_ADDRESS, CHAIN_ID)
      const message = buildRedemptionMessage(tokenId, LUCKY_PASS_ADDRESS, CHAIN_ID, nonce, ts)
      const sig = await signTypedDataAsync({
        domain,
        types: REDEMPTION_TYPES,
        primaryType: 'RedemptionChallenge',
        message,
      })
      setSignature(sig)
      setStep('redeem')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('cancelled')) {
        toast.info(t('toast.sigCancelled'))
      } else {
        toast.error(t('toast.sigError'))
      }
      setStep('confirm')
    }
  }

  const handleRedeem = () => {
    if (tokenId === undefined || !signature || nonce === undefined) return
    redeem.redeem(tokenId, signature, nonce, challengeTimestamp)
    toast.promise(
      new Promise<void>((res, rej) => {
        const check = () => {
          void refetchTicket().then(r => {
            const info = r.data
            if (info?.[4]) { res(); setStep('done') }
            else setTimeout(check, 1500)
          })
        }
        setTimeout(check, 2000)
        setTimeout(() => rej(new Error('timeout')), 45000)
      }),
      { loading: t('toast.redeemLoading'), success: t('toast.redeemSuccess'), error: t('toast.redeemError') }
    )
  }

  // Map redeem error to translated string
  const redeemErrorText = (() => {
    if (!redeem.error) return null
    const msg = redeem.error.message
    if (msg.includes('ChallengeExpired'))  return t('redeem.errExpired')
    if (msg.includes('AlreadyRedeemed'))   return t('redeem.errAlready')
    if (msg.includes('NonceMismatch'))     return t('redeem.errNonce')
    if (msg.includes('InvalidSignature'))  return t('redeem.errSig')
    return `${t('redeem.errGeneric')}: ${msg.slice(0, 80)}`
  })()

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
        <div className="p-5 border-b border-gray-50">
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-violet-600" />
            <h2 className="font-semibold text-gray-900">{t('redeem.title')}</h2>
          </div>
          <p className="text-xs text-gray-500 mt-1">{t('redeem.subtitle')}</p>
        </div>

        {/* Step: Lookup */}
        {step === 'lookup' && (
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
              onClick={handleLookup}
              disabled={!tokenIdInput}
              className="w-full py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              {t('redeem.lookupButton')}
            </button>
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
            ) : (
              <>
                <p className="text-xs text-gray-500 text-center">{t('redeem.signInstruction')}</p>
                <button
                  onClick={() => { void handleSign() }}
                  className="w-full py-2.5 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 active:scale-95 transition-all"
                >
                  {t('redeem.signButton')}
                </button>
              </>
            )}

            <button
              onClick={() => { setStep('lookup'); setTokenId(undefined) }}
              className="w-full py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              {t('redeem.anotherTicket')}
            </button>
          </div>
        )}

        {/* Step: Signing in progress */}
        {step === 'sign' && (
          <div className="p-10 flex flex-col items-center gap-4 text-center">
            <Loader size={28} className="text-violet-500 animate-spin" />
            <p className="text-sm text-gray-700">{t('redeem.signingWait')}</p>
            <p className="text-xs text-gray-400">{t('redeem.signingHint')}</p>
          </div>
        )}

        {/* Step: Redeem */}
        {step === 'redeem' && signature && (
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
              {redeem.isPending || redeem.isConfirming ? t('redeem.redeemingButton') : t('redeem.redeemButton')}
            </button>
            {redeemErrorText && (
              <p className="text-xs text-red-600 bg-red-50 p-3 rounded-lg">{redeemErrorText}</p>
            )}
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
              onClick={() => { setStep('lookup'); setTokenId(undefined); setSignature(undefined) }}
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
