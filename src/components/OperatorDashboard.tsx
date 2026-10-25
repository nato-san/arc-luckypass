import { useState } from 'react'
import { useAccount, useBalance, usePublicClient } from 'wagmi'
import { Plus, Zap, Users, ChevronDown, ChevronUp, ExternalLink, Globe } from 'lucide-react'
import { parseUnits, formatUnits } from 'viem'
import { arcTestnet } from 'viem/chains'
import { buildTxExplorerUrl } from '@/onchain-facts'
import {
  useLotCount, useLot, useEntrantCount, useWaitlistLength,
  useCreateLot, useRequestDraw, useSelectWinners, useSetVenueOperator, usePromoteWaitlist,
} from '@/hooks/useLuckyPass'
import { LUCKY_PASS_ADDRESS } from '@/lib/luckypass-abi'
import { useLocale } from '@/i18n/LocaleContext'
import { DateTimePicker } from '@/components/DateTimePicker'
import { toast } from 'sonner'

const CHAIN_ID = arcTestnet.id
const VRF_COORDINATOR = '0xd20DA0FF9087d053f0291524Eac12abA1ADBd945' as const

const COORDINATOR_ABI = [
  {
    name: 'quoteFee',
    type: 'function',
    inputs: [{ name: 'callbackGasLimit', type: 'uint32' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    // quoteFeeAt lets callers supply an explicit baseFee — required off-chain because
    // eth_call reports baseFeePerGas=0, which collapses quoteFee to minFee and causes
    // the live requestDraw transaction to revert with IncorrectFee.
    name: 'quoteFeeAt',
    type: 'function',
    inputs: [
      { name: 'callbackGasLimit', type: 'uint32' },
      { name: 'baseFee', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

const CALLBACK_GAS = 120_000

interface LotRowProps {
  lotId: bigint
}

function LotRow({ lotId }: LotRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [operatorAddr, setOperatorAddr] = useState('')
  const { data: lot } = useLot(lotId)
  const { data: entrantCount } = useEntrantCount(lotId)
  const { data: waitlistLen } = useWaitlistLength(lotId)
  const { t } = useLocale()
  const requestDraw = useRequestDraw()
  const selectWinners = useSelectWinners()
  const setOperator = useSetVenueOperator()
  const promote = usePromoteWaitlist()
  const publicClient = usePublicClient({ chainId: CHAIN_ID })

  if (!lot) return null

  const [name, , , supply, , , stateNum, ticketsMinted] = lot
  const state = Number(stateNum)

  const STATE_LABELS: Record<number, string> = {
    0: 'OPEN', 1: 'DRAWING', 2: 'WORD RECEIVED', 3: 'ACTIVE', 4: 'CLOSED',
  }

  const handleRequestDraw = async () => {
    if (!publicClient) { toast.error(t('op.errNetwork')); return }
    try {
      // eth_call reports baseFeePerGas=0, so quoteFee() collapses to minFee and the
      // live tx reverts with IncorrectFee. Fetch the latest block's actual baseFee
      // and pass it to quoteFeeAt, then add a 30% buffer for base-fee movement
      // between quote time and inclusion (EIP-1559 can rise 12.5% per block).
      const block = await publicClient.getBlock({ blockTag: 'latest' })
      const baseFee = block.baseFeePerGas ?? 0n
      const baseFeeBuffered = (baseFee * 130n) / 100n
      const fee = await publicClient.readContract({
        address: VRF_COORDINATOR,
        abi: COORDINATOR_ABI,
        functionName: 'quoteFeeAt',
        args: [CALLBACK_GAS, baseFeeBuffered],
      })
      // Add a small extra 5% on top of the already-buffered quote for safety
      const value = (fee * 105n) / 100n
      toast.info(`${t('op.vrfFeeInfo')}: ${formatUnits(value, 18)} USDC ${t('op.vrfFeeBuffer')}`)
      requestDraw.requestDraw(lotId, value)
    } catch {
      toast.error(t('op.errVrfFee'))
    }
  }

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left gap-2"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-medium text-gray-900 text-sm truncate">{name}</span>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full shrink-0">
            {STATE_LABELS[state] ?? 'UNKNOWN'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400 shrink-0">
          <span>{String(entrantCount ?? 0)}{t('op.lotCount')}</span>
          <span>{String(ticketsMinted)}/{String(supply)}{t('op.ticketsCount')}</span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {expanded && (
        <div className="p-4 pt-0 border-t border-gray-50 space-y-3">
          {state === 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">{t('op.stateOpen')}</p>
              <button
                onClick={() => { void handleRequestDraw() }}
                disabled={requestDraw.isPending || requestDraw.isConfirming}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 disabled:opacity-50"
              >
                <Zap size={12} /> {t('op.requestDraw')}
              </button>
              {requestDraw.hash && (
                <a href={buildTxExplorerUrl(CHAIN_ID, requestDraw.hash)} target="_blank" rel="noopener noreferrer"
                   className="flex items-center gap-1 text-xs text-blue-600">
                  <ExternalLink size={10} /> {t('op.viewTx')}
                </a>
              )}
            </div>
          )}

          {state === 1 && (
            <div className="p-3 bg-amber-50 rounded-lg text-xs text-amber-700">
              {t('op.vrfWaiting')}
            </div>
          )}

          {state === 2 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">{t('op.wordReceived')}</p>
              <button
                onClick={() => selectWinners.selectWinners(lotId)}
                disabled={selectWinners.isPending || selectWinners.isConfirming}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 disabled:opacity-50"
              >
                <Users size={12} /> {t('op.selectWinners')}
              </button>
            </div>
          )}

          {state === 3 && (() => {
            const [,,,,,, , , , , , fixedDeadline] = lot
            const isFixedDeadline = fixedDeadline > 0n
            return (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">
                  {t('op.waitlistInfo')}: {String(waitlistLen ?? 0)}{t('op.waitlistUnit')}
                </p>
                {isFixedDeadline ? (
                  <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                    {t('op.promoteDisabledFixed')}
                  </p>
                ) : (
                  <button
                    onClick={() => promote.promoteWaitlist(lotId, 0)}
                    disabled={promote.isPending || promote.isConfirming || (waitlistLen ?? 0n) === 0n}
                    className="px-3 py-2 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-800 disabled:opacity-50"
                  >
                    {t('op.promoteSlot')}
                  </button>
                )}
              </div>
            )
          })()}

          {/* Venue operator management */}
          <div className="space-y-1.5 pt-2 border-t border-gray-50">
            <p className="text-xs font-medium text-gray-600">{t('op.venueStaff')}</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={operatorAddr}
                onChange={e => setOperatorAddr(e.target.value)}
                placeholder="0x..."
                className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
              <button
                onClick={() => {
                  if (!operatorAddr.startsWith('0x')) { toast.error(t('op.errInvalidAddress')); return }
                  setOperator.setVenueOperator(lotId, operatorAddr as `0x${string}`, true)
                  setOperatorAddr('')
                }}
                disabled={setOperator.isPending || setOperator.isConfirming}
                className="px-2.5 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-800 disabled:opacity-50 shrink-0"
              >
                {t('op.addStaff')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface CreateLotFormProps {
  onClose: () => void
}

// Payment window presets: [translationKey, seconds]
const WINDOW_PRESETS: Array<{ key: string; seconds: number }> = [
  { key: 'op.window1h',  seconds: 3_600 },
  { key: 'op.window24h', seconds: 86_400 },
  { key: 'op.window48h', seconds: 172_800 },
  { key: 'op.window72h', seconds: 259_200 },
  { key: 'op.window7d',  seconds: 604_800 },
  { key: 'op.window14d', seconds: 1_209_600 },
  { key: 'op.window30d', seconds: 2_592_000 },
  { key: 'op.windowCustom', seconds: -1 },
]

function CreateLotForm({ onClose }: CreateLotFormProps) {
  const [form, setForm] = useState({
    name: '', description: '', priceUsdc: '', supply: '', maxEntrants: '200',
  })
  // Capture "now" once at mount so minUnix is stable across renders
  const [nowUnix] = useState(() => Math.floor(Date.now() / 1000))
  // Shared timezone for all date pickers in this form (JST default)
  const [tz, setTz] = useState<'JST' | 'UTC'>('JST')
  // Unix timestamps (seconds) for date fields; null = not set
  const [entryOpenAt, setEntryOpenAt]       = useState<number | null>(null)
  const [entryCloseAt, setEntryCloseAt]     = useState<number | null>(null)
  const [fixedDeadlineAt, setFixedDeadlineAt] = useState<number | null>(null)
  // Payment mode: 'relative' = paymentWindow preset, 'fixed' = fixedDeadlineAt
  const [paymentMode, setPaymentMode] = useState<'relative' | 'fixed'>('relative')
  const [windowPreset, setWindowPreset] = useState('op.window24h')
  const [customHours, setCustomHours] = useState('')

  const createLot = useCreateLot()
  const { t } = useLocale()

  const paymentWindowSeconds = (): bigint | null => {
    if (paymentMode === 'fixed') return 0n
    if (windowPreset === 'op.windowCustom') {
      const h = parseFloat(customHours)
      if (!Number.isFinite(h) || h <= 0) return null
      return BigInt(Math.round(h * 3600))
    }
    const preset = WINDOW_PRESETS.find(p => p.key === windowPreset)
    return preset ? BigInt(preset.seconds) : null
  }

  const handleCreate = () => {
    if (!form.name || !form.priceUsdc || !form.supply) {
      toast.error(t('op.errAllFields')); return
    }
    if (entryCloseAt === null) {
      toast.error(t('op.errEntryCloseRequired')); return
    }
    if (entryOpenAt !== null && entryOpenAt >= entryCloseAt) {
      toast.error(t('op.errEntryCloseOrder')); return
    }
    if (paymentMode === 'fixed') {
      if (fixedDeadlineAt === null) {
        toast.error(t('op.errFixedDeadlineRequired')); return
      }
      if (fixedDeadlineAt <= entryCloseAt) {
        toast.error(t('op.errFixedDeadlineOrder')); return
      }
    }
    const windowSec = paymentWindowSeconds()
    if (paymentMode === 'relative' && (windowSec === null || windowSec <= 0n)) {
      toast.error(t('op.errInvalidInput')); return
    }
    try {
      const priceRaw = parseUnits(form.priceUsdc, 6)
      const supply = parseInt(form.supply)
      const maxEntrants = parseInt(form.maxEntrants) || 200
      const window = windowSec ?? 0n
      createLot.createLot(
        form.name, form.description, priceRaw, supply, window, maxEntrants,
        BigInt(entryOpenAt ?? 0),
        BigInt(entryCloseAt),
        BigInt(fixedDeadlineAt ?? 0),
      )
      toast.promise(
        new Promise<void>(res => setTimeout(res, 5000)),
        { loading: t('toast.createLoading'), success: t('toast.createSuccess'), error: t('toast.createError') }
      )
    } catch {
      toast.error(t('op.errInvalidInput'))
    }
  }

  const field = (label: string, key: keyof typeof form, type = 'text', placeholder = '') => (
    <div>
      <label className="block text-xs text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
      />
    </div>
  )

  const windowSec = paymentWindowSeconds()

  return (
    <div className="border border-violet-100 rounded-xl p-5 bg-violet-50/50 space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">{t('op.createTitle')}</h3>
      {field(t('op.fieldName'), 'name', 'text', 'e.g. Limited T-Shirt')}
      {field(t('op.fieldDesc'), 'description', 'text')}
      {field(t('op.fieldPrice'), 'priceUsdc', 'number', 'e.g. 25')}
      {field(t('op.fieldSupply'), 'supply', 'number', 'e.g. 10')}

      {/* Timezone toggle — shared for all date pickers */}
      <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
        <span className="text-xs text-gray-500 flex items-center gap-1">
          <Globe size={12} /> {t('op.timezoneLabel')} <strong>{tz}</strong>
        </span>
        <button
          type="button"
          onClick={() => setTz(prev => prev === 'JST' ? 'UTC' : 'JST')}
          className="text-xs text-violet-600 font-medium hover:text-violet-800"
        >
          {tz === 'JST' ? t('op.timezoneToggle') : t('op.timezoneToggleJst')}
        </button>
      </div>

      {/* Entry open (optional) */}
      <DateTimePicker
        label={t('op.fieldEntryOpen')}
        hint={t('op.fieldEntryOpenHint')}
        value={entryOpenAt}
        onChange={setEntryOpenAt}
        timezone={tz}
        minUnix={nowUnix}
      />

      {/* Entry close (required) */}
      <DateTimePicker
        label={t('op.fieldEntryClose')}
        hint={t('op.fieldEntryCloseHint')}
        required
        value={entryCloseAt}
        onChange={setEntryCloseAt}
        timezone={tz}
        minUnix={entryOpenAt ?? nowUnix}
      />

      {/* Payment deadline mode toggle */}
      <div>
        <label className="block text-xs text-gray-600 mb-2">{t('op.fieldPaymentMode')}</label>
        <div className="flex gap-2">
          {(['relative', 'fixed'] as const).map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => setPaymentMode(mode)}
              className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-colors ${
                paymentMode === mode
                  ? 'bg-violet-600 border-violet-600 text-white'
                  : 'bg-white border-gray-200 text-gray-700 hover:border-violet-300'
              }`}
            >
              {mode === 'relative' ? t('op.paymentModeRelative') : t('op.paymentModeFixed')}
            </button>
          ))}
        </div>
      </div>

      {/* Relative: preset selector */}
      {paymentMode === 'relative' && (
        <div>
          <label className="block text-xs text-gray-600 mb-1">{t('op.fieldWindow')}</label>
          <p className="text-xs text-gray-400 mb-2">{t('op.windowHint')}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {WINDOW_PRESETS.map(preset => (
              <button
                key={preset.key}
                type="button"
                onClick={() => setWindowPreset(preset.key)}
                className={`px-2 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                  windowPreset === preset.key
                    ? 'bg-violet-600 border-violet-600 text-white'
                    : 'bg-white border-gray-200 text-gray-700 hover:border-violet-300'
                }`}
              >
                {t(preset.key as Parameters<typeof t>[0])}
              </button>
            ))}
          </div>
          {windowPreset === 'op.windowCustom' && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number" min="1" step="1"
                value={customHours}
                onChange={e => setCustomHours(e.target.value)}
                placeholder={t('op.windowCustomLabel')}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          )}
          {windowSec !== null && windowSec > 0n && (
            <p className="mt-1.5 text-xs text-gray-400">
              {t('op.windowPreview')}<span className="font-mono">{windowSec.toLocaleString()}</span>
            </p>
          )}
        </div>
      )}

      {/* Fixed: absolute deadline picker */}
      {paymentMode === 'fixed' && (
        <DateTimePicker
          label={t('op.fieldFixedDeadline')}
          hint={t('op.fieldFixedDeadlineHint')}
          required
          value={fixedDeadlineAt}
          onChange={setFixedDeadlineAt}
          timezone={tz}
          minUnix={entryCloseAt ?? nowUnix}
        />
      )}

      {field(t('op.fieldMaxEntrants'), 'maxEntrants', 'number', 'e.g. 200 (max 500)')}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          onClick={handleCreate}
          disabled={createLot.isPending || createLot.isConfirming}
          className="flex-1 min-w-[120px] py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
        >
          {createLot.isPending || createLot.isConfirming ? t('op.creatingButton') : t('op.createButton')}
        </button>
        <button onClick={onClose} className="min-w-[80px] px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
          {t('op.cancelButton')}
        </button>
      </div>
    </div>
  )
}

export function OperatorDashboard() {
  const { address } = useAccount()
  const { data: lotCount } = useLotCount()
  const { data: contractBalance } = useBalance({ address: LUCKY_PASS_ADDRESS, chainId: CHAIN_ID })
  const [showCreate, setShowCreate] = useState(false)
  const { t } = useLocale()

  const count = Number(lotCount ?? 0n)

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-gray-900">{t('op.title')}</h2>
          <p className="text-xs text-gray-400 mt-0.5 font-mono truncate">{address?.slice(0, 10)}…</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 shrink-0"
        >
          <Plus size={14} /> {t('op.newLot')}
        </button>
      </div>

      {/* VRF fee info — fee paid directly at requestDraw time, no pre-funding needed */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm">
        <p className="text-blue-800 font-medium">{t('op.vrfFeeModelTitle')}</p>
        <p className="text-xs text-blue-700 mt-1">{t('op.vrfFeeModelDesc')}</p>
        {contractBalance && contractBalance.value > 0n && (
          <p className="text-xs text-blue-600 mt-1">
            {t('op.contractBalance')}: {formatUnits(contractBalance.value, 18)} USDC
          </p>
        )}
      </div>

      {/* Create lot form */}
      {showCreate && <CreateLotForm onClose={() => setShowCreate(false)} />}

      {/* Lot list */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-gray-700">{t('op.allLots')} ({count})</h3>
        {count === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">{t('op.noLots')}</p>
        ) : (
          Array.from({ length: count }, (_, i) => BigInt(i + 1)).map(lotId => (
            <LotRow key={String(lotId)} lotId={lotId} />
          ))
        )}
      </div>
    </div>
  )
}
