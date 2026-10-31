import { useState, useEffect, useCallback } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { Ticket, Settings, Building2, Shield, BookOpen, AlertTriangle, Lock, Wifi } from 'lucide-react'
import { CHAIN_ID, ACTIVE_CHAIN, LUCKY_PASS_CONTRACT_ADDRESS, VRF_COORDINATOR } from '@/lib/chain-config'
import { LotGrid } from './components/LotGrid'
import { PurchaseFlow } from './components/PurchaseFlow'
import { OperatorDashboard } from './components/OperatorDashboard'
import { RedemptionView } from './components/RedemptionView'
import { ManualPage } from './components/ManualPage'
import { ChainGuard } from './components/ChainGuard'
import { useRole } from './hooks/useLuckyPass'
import { useLocale } from './i18n/LocaleContext'
import { LanguageToggle } from './i18n/LanguageToggle'
import type { TranslationKey } from './i18n/translations'

// ─── Hash-based router ────────────────────────────────────────────────────────
// Routes:
//   /              → BuyerApp (lot list)
//   /#/lot/:id     → BuyerApp (specific lot purchase page)
//   /#/store       → StoreApp (operator dashboard)
//   /#/store/redeem→ StoreApp (QR redemption)

type Route =
  | { page: 'buyer-list' }
  | { page: 'buyer-lot'; lotId: bigint }
  | { page: 'store'; storeView: StoreView }

type StoreView = 'operator' | 'redeem' | 'manual'

function parseHash(hash: string): Route {
  const h = hash.replace(/^#\/?/, '')
  if (h.startsWith('store/redeem')) return { page: 'store', storeView: 'redeem' }
  if (h.startsWith('store')) return { page: 'store', storeView: 'operator' }
  const lotMatch = h.match(/^lot\/(\d+)$/)
  if (lotMatch) {
    try { return { page: 'buyer-lot', lotId: BigInt(lotMatch[1]) } } catch { /* fall through */ }
  }
  return { page: 'buyer-list' }
}

function useRoute(): [Route, (r: Route) => void] {
  const [route, setRouteState] = useState<Route>(() => parseHash(window.location.hash))

  useEffect(() => {
    const handler = () => setRouteState(parseHash(window.location.hash))
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])

  const navigate = useCallback((r: Route) => {
    if (r.page === 'buyer-list') window.location.hash = ''
    else if (r.page === 'buyer-lot') window.location.hash = `#/lot/${r.lotId}`
    else if (r.page === 'store') {
      window.location.hash = r.storeView === 'redeem' ? '#/store/redeem' : '#/store'
    }
    setRouteState(r)
  }, [])

  return [route, navigate]
}

// ─── Permission gate ──────────────────────────────────────────────────────────
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

// ─── Buyer app ────────────────────────────────────────────────────────────────

interface BuyerAppProps {
  initialLotId?: bigint
}

function BuyerApp({ initialLotId }: BuyerAppProps) {
  const { t } = useLocale()
  // localLotId overrides initialLotId when the user navigates within the buyer page
  // (e.g. clicks a lot card from the list). Reset to undefined to go back to the list.
  const [localLotId, setLocalLotId] = useState<bigint | undefined>(undefined)
  const selectedLotId = localLotId ?? initialLotId
  const inPurchase = selectedLotId !== undefined

  return (
    <div className="min-h-dvh bg-gray-50 font-[DM_Sans,sans-serif]">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <button
            onClick={() => setLocalLotId(undefined)}
            className="flex items-center gap-2 font-semibold text-gray-900 shrink-0"
          >
            <div className="w-7 h-7 rounded-lg bg-gray-900 flex items-center justify-center">
              <Ticket size={14} className="text-white" />
            </div>
            <span className="hidden sm:inline">Arc LuckyPass</span>
            <span className="sm:hidden">LuckyPass</span>
          </button>
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <a
              href="#/store"
              className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
            >
              <Settings size={12} />
              {t('nav.storeMgmt')}
            </a>
            <LanguageToggle />
            <ConnectKitButton />
          </div>
        </div>
      </header>

      {/* Wrong-network banner */}
      <ChainGuard />

      {/* Main content — no store tabs visible to buyers */}
      <main>
        {!inPurchase ? (
          <div className="max-w-2xl mx-auto px-4 py-8">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900">{t('home.title')}</h1>
              <p className="text-sm text-gray-500 mt-1">{t('home.subtitle')}</p>
            </div>
            {/* LotGrid works even when wallet is not connected */}
            <LotGrid onSelectLot={setLocalLotId} />
            {/* Network info — driven by chain-config, works for both Testnet and Mainnet */}
            <div className="mt-8 p-4 bg-white rounded-xl border border-gray-100 text-xs text-gray-400 space-y-1">
              <p className="font-medium text-gray-600">{t('home.networkInfo')}</p>
              <p>{t('home.contract')}: <span className="font-mono break-all">{LUCKY_PASS_CONTRACT_ADDRESS}</span></p>
              <p>{t('home.randomness')}: D20DAO VRF (<span className="font-mono">{VRF_COORDINATOR.slice(0, 10)}…</span>)</p>
              <p>{t('home.chain')}: {ACTIVE_CHAIN.name} ({CHAIN_ID})</p>
            </div>
          </div>
        ) : (
          <PurchaseFlow
            lotId={selectedLotId}
            onBack={() => setLocalLotId(undefined)}
          />
        )}
      </main>
    </div>
  )
}

// ─── Store app ────────────────────────────────────────────────────────────────

interface StoreTabBarProps {
  view: StoreView
  setView: (v: StoreView) => void
  t: (k: TranslationKey) => string
}

function StoreTabBar({ view, setView, t }: StoreTabBarProps) {
  const active = 'border-b-2 border-gray-900 text-gray-900 font-semibold'
  const inactive = 'border-b-2 border-transparent text-gray-500 hover:text-gray-700'

  const tabs: { id: StoreView; label: string; icon: React.ReactNode }[] = [
    { id: 'operator', label: t('nav.operations'), icon: <Settings size={14} /> },
    { id: 'redeem',   label: t('nav.redeem'),      icon: <Shield size={14} /> },
    { id: 'manual',   label: t('nav.manual'),      icon: <BookOpen size={14} /> },
  ]

  return (
    <div className="bg-white border-b border-gray-100 overflow-x-auto">
      <div className="max-w-2xl mx-auto px-2 flex gap-0 min-w-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-4 py-3 text-xs sm:text-sm transition-colors whitespace-nowrap shrink-0 ${view === tab.id ? active : inactive}`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// PublicUrlBanner removed — per-lot URLs are now shown inside each LotRow
// in OperatorDashboard instead of a single fixed banner here.

interface StoreAppProps {
  initialView: StoreView
  navigate: (r: Route) => void
}

function StoreApp({ initialView, navigate }: StoreAppProps) {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { t } = useLocale()
  // view is always derived from the hash (initialView) — no local state needed
  const view = initialView

  const isCorrectChain = chainId === CHAIN_ID
  // canManage = wallet connected (createLot is permissionless)
  const { canManage } = useRole(1n)

  // When tab changes update hash; navigating back via browser also updates initialView
  // which re-renders StoreApp with new initialView, so view follows without a useEffect.
  const handleSetView = (v: StoreView) => {
    navigate({ page: 'store', storeView: v })
  }

  return (
    <div className="min-h-dvh bg-gray-50 font-[DM_Sans,sans-serif]">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-semibold text-gray-900 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
              <Building2 size={14} className="text-white" />
            </div>
            <span className="hidden sm:inline text-violet-700">{t('store.appTitle')}</span>
            <span className="sm:hidden text-violet-700">管理</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <LanguageToggle />
            <ConnectKitButton />
          </div>
        </div>
      </header>

      {/* Wrong-network banner */}
      <ChainGuard />

      {/* Tab bar — store-only tabs */}
      <StoreTabBar view={view} setView={handleSetView} t={t} />

      {/* Content */}
      <main>
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

        {/* QR引換 */}
        {view === 'redeem' && (
          <RedemptionView onBack={() => handleSetView('operator')} />
        )}

        {/* 使い方ガイド */}
        {view === 'manual' && (
          <ManualPage onBack={() => handleSetView('operator')} />
        )}
      </main>
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [route, navigate] = useRoute()

  if (route.page === 'store') {
    return <StoreApp initialView={route.storeView} navigate={navigate} />
  }

  const initialLotId = route.page === 'buyer-lot' ? route.lotId : undefined
  return <BuyerApp initialLotId={initialLotId} />
}
