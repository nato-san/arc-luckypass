import { useState } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { Ticket, Settings, Building2, Shield, AlertTriangle, Lock, Wifi } from 'lucide-react'
import { arcTestnet } from 'viem/chains'
import { LotGrid } from './components/LotGrid'
import { PurchaseFlow } from './components/PurchaseFlow'
import { OperatorDashboard } from './components/OperatorDashboard'
import { StoreManager } from './components/StoreManager'
import { RedemptionView } from './components/RedemptionView'
import { ChainGuard } from './components/ChainGuard'
import { useRole } from './hooks/useLuckyPass'
import { useLocale } from './i18n/LocaleContext'
import { LanguageToggle } from './i18n/LanguageToggle'
import type { TranslationKey } from './i18n/translations'

type View = 'lots' | 'purchase' | 'operator' | 'storemanager' | 'redeem'

// ─── Permission gate ─────────────────────────────────────────────────────────
// Shows a clear reason why the user cannot access a protected view.
interface GateProps {
  isConnected: boolean
  isCorrectChain: boolean
  hasPermission: boolean
  titleKey: TranslationKey
  descKey: TranslationKey
  t: (k: TranslationKey) => string
  children: React.ReactNode
}

function PermissionGate({ isConnected, isCorrectChain, hasPermission, titleKey, descKey, t, children }: GateProps) {
  if (!isConnected) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <Wifi size={40} className="mx-auto mb-4 text-gray-300" />
        <p className="text-base font-semibold text-gray-700 mb-2">{t('gate.connectTitle')}</p>
        <p className="text-sm text-gray-500 mb-6">{t('gate.connectDesc')}</p>
        <ConnectKitButton />
      </div>
    )
  }
  if (!isCorrectChain) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <AlertTriangle size={40} className="mx-auto mb-4 text-amber-300" />
        <p className="text-base font-semibold text-gray-700 mb-2">{t('gate.switchNetwork')}</p>
      </div>
    )
  }
  if (!hasPermission) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <Lock size={40} className="mx-auto mb-4 text-gray-300" />
        <p className="text-base font-semibold text-gray-700 mb-2">{t(titleKey)}</p>
        <p className="text-sm text-gray-500 mb-6">{t(descKey)}</p>
        <ConnectKitButton />
      </div>
    )
  }
  return <>{children}</>
}

// ─── Tab bar ─────────────────────────────────────────────────────────────────
interface TabBarProps {
  view: View
  setView: (v: View) => void
  t: (k: TranslationKey) => string
}

function TabBar({ view, setView, t }: TabBarProps) {
  const active = 'border-b-2 border-gray-900 text-gray-900 font-semibold'
  const inactive = 'border-b-2 border-transparent text-gray-500 hover:text-gray-700'

  const tabs: { id: View; label: string; icon: React.ReactNode }[] = [
    { id: 'lots',         label: t('nav.lottery'),    icon: <Ticket size={14} /> },
    { id: 'redeem',       label: t('header.ticketRedeem'), icon: <Shield size={14} /> },
    { id: 'operator',     label: t('nav.operations'), icon: <Settings size={14} /> },
    { id: 'storemanager', label: t('nav.storeAdmin'),  icon: <Building2 size={14} /> },
  ]

  return (
    <div className="bg-white border-b border-gray-100">
      <div className="max-w-2xl mx-auto px-4 flex gap-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm transition-colors whitespace-nowrap ${view === tab.id || (view === 'purchase' && tab.id === 'lots') ? active : inactive}`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const [view, setView] = useState<View>('lots')
  const [selectedLotId, setSelectedLotId] = useState<bigint | undefined>()
  const { t } = useLocale()

  const isCorrectChain = chainId === arcTestnet.id

  // Role reads — safe even before connect (returns undefined, not error)
  const { isOwner, canManage } = useRole(1n)

  const handleSelectLot = (lotId: bigint) => {
    setSelectedLotId(lotId)
    setView('purchase')
  }

  return (
    <div className="min-h-dvh bg-gray-50 font-[DM_Sans,sans-serif]">
      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <button
            onClick={() => setView('lots')}
            className="flex items-center gap-2 font-semibold text-gray-900 shrink-0"
          >
            <div className="w-7 h-7 rounded-lg bg-gray-900 flex items-center justify-center">
              <Ticket size={14} className="text-white" />
            </div>
            <span>Arc LuckyPass</span>
          </button>

          <div className="flex items-center gap-1.5">
            <LanguageToggle />
            <ConnectKitButton />
          </div>
        </div>
      </header>

      {/* ── Wrong-network banner ── */}
      <ChainGuard />

      {/* ── Tab bar (always visible) ── */}
      <TabBar view={view} setView={setView} t={t} />

      {/* ── Main content ── */}
      <main>

        {/* 抽選に参加 */}
        {(view === 'lots' || view === 'purchase') && (
          <>
            {view === 'lots' && (
              <div className="max-w-2xl mx-auto px-4 py-8">
                <div className="mb-6">
                  <h1 className="text-2xl font-bold text-gray-900">{t('home.title')}</h1>
                  <p className="text-sm text-gray-500 mt-1">{t('home.subtitle')}</p>
                </div>

                {!isConnected ? (
                  <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
                    <Ticket size={36} className="mx-auto mb-4 text-gray-300" />
                    <p className="text-sm text-gray-600 mb-4">{t('home.connectPrompt')}</p>
                    <ConnectKitButton />
                  </div>
                ) : (
                  <LotGrid onSelectLot={handleSelectLot} />
                )}

                {/* Testnet info */}
                <div className="mt-8 p-4 bg-white rounded-xl border border-gray-100 text-xs text-gray-400 space-y-1">
                  <p className="font-medium text-gray-600">{t('home.testnetInfo')}</p>
                  <p>{t('home.contract')}: <span className="font-mono">0x101c391d239a647d590d8493aae1dd5770f4a33a</span></p>
                  <p>{t('home.randomness')}: D20DAO VRF (Arc Testnet Coordinator)</p>
                  <p>{t('home.chain')}: Arc Testnet (5042002)</p>
                </div>
              </div>
            )}

            {view === 'purchase' && selectedLotId !== undefined && (
              <PurchaseFlow lotId={selectedLotId} onBack={() => setView('lots')} />
            )}
          </>
        )}

        {/* 運営管理 */}
        {view === 'operator' && (
          <PermissionGate
            isConnected={isConnected}
            isCorrectChain={isCorrectChain}
            hasPermission={canManage}
            titleKey="gate.notStoreTitle"
            descKey="gate.notStoreDesc"
            t={t}
          >
            <OperatorDashboard />
          </PermissionGate>
        )}

        {/* 店舗管理 */}
        {view === 'storemanager' && (
          <PermissionGate
            isConnected={isConnected}
            isCorrectChain={isCorrectChain}
            hasPermission={isOwner}
            titleKey="gate.notAdminTitle"
            descKey="gate.notAdminDesc"
            t={t}
          >
            <StoreManager />
          </PermissionGate>
        )}

        {/* 引換 (venue operators — チェックはビュー内部) */}
        {view === 'redeem' && <RedemptionView onBack={() => setView('lots')} />}
      </main>
    </div>
  )
}
