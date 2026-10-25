/* oxlint-disable react/set-state-in-effect -- useEffect here synchronizes React
   state with an external system (Arc blockchain via RPC), which is the intended
   use case per React docs. The rule fires a false positive for this pattern. */

/**
 * StoreManager — Platform Admin only
 *
 * Approved-store list is derived entirely from on-chain events:
 *   StoreApproved(address indexed store)
 *   StoreRevoked(address indexed store)
 *
 * Events are replayed in chronological order to compute the current approval
 * status for each address that ever appeared in either event.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { isAddress, parseAbiItem } from 'viem'
import type { Log } from 'viem'
import { arcTestnet } from 'viem/chains'
import { Store, UserCheck, UserX, RefreshCw, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { LUCKY_PASS_ADDRESS } from '@/lib/luckypass-abi'
import { useApproveStore, useRevokeStore, useRole } from '@/hooks/useLuckyPass'
import { useLocale } from '@/i18n/LocaleContext'

const CHAIN_ID = arcTestnet.id

// Block where LuckyPass v2 was deployed — getLogs lower bound.
const DEPLOY_BLOCK = 68_705_407n

// Blocks per getLogs request. Keep well within Arc Testnet RPC limits.
const CHUNK_SIZE = 2_000n

// Delay between sequential chunk requests (ms) to avoid rate-limit bursts.
const INTER_CHUNK_DELAY_MS = 300

// Exponential-backoff config for rate-limited requests.
const MAX_RETRIES = 4
const BACKOFF_BASE_MS = 1_000

// ─── ABI definitions ─────────────────────────────────────────────────────────

const STORE_APPROVED_ABI = parseAbiItem('event StoreApproved(address indexed store)')
const STORE_REVOKED_ABI  = parseAbiItem('event StoreRevoked(address indexed store)')

type StoreLog = Log<bigint, number, false, typeof STORE_APPROVED_ABI, true>
type StoreEvent = typeof STORE_APPROVED_ABI | typeof STORE_REVOKED_ABI
type PublicClient = NonNullable<ReturnType<typeof usePublicClient>>

// ─── Helpers ─────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

function isRateLimit(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return msg.includes('rate limit') || msg.includes('429') || msg.includes('too many requests')
}

/** Fetch one getLogs chunk with exponential-backoff retry on rate-limit errors. */
async function fetchChunkWithRetry(
  client: PublicClient,
  event: StoreEvent,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<StoreLog[]> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const chunk = await client.getLogs({
        address: LUCKY_PASS_ADDRESS,
        event,
        fromBlock,
        toBlock,
        strict: true,
      })
      return chunk as StoreLog[]
    } catch (err) {
      const isLast = attempt === MAX_RETRIES
      if (!isRateLimit(err) || isLast) throw err
      // Exponential backoff: 1s, 2s, 4s, 8s
      await sleep(BACKOFF_BASE_MS * Math.pow(2, attempt))
    }
  }
  return [] // unreachable
}

/**
 * Fetch all logs for one event type from [fromBlock, toBlock], sequentially
 * one chunk at a time with a brief inter-chunk pause to avoid rate limiting.
 */
async function fetchEventLogsSequential(
  client: PublicClient,
  event: StoreEvent,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<StoreLog[]> {
  const logs: StoreLog[] = []
  let from = fromBlock
  while (from <= toBlock) {
    const to = from + CHUNK_SIZE - 1n < toBlock ? from + CHUNK_SIZE - 1n : toBlock
    const chunk = await fetchChunkWithRetry(client, event, from, to)
    logs.push(...chunk)
    from = to + 1n
    // Pause between chunks only when there are more chunks to fetch
    if (from <= toBlock) await sleep(INTER_CHUNK_DELAY_MS)
  }
  return logs
}

/** Replay merged events to derive current approval state per address. */
type RawEvent = { blockNumber: bigint; logIndex: number; address: `0x${string}`; approved: boolean }

function replayEvents(approved: StoreLog[], revoked: StoreLog[]): StoreEntry[] {
  const merged: RawEvent[] = [
    ...approved.map(l => ({ blockNumber: l.blockNumber ?? 0n, logIndex: l.logIndex ?? 0, address: l.args.store, approved: true })),
    ...revoked.map(l =>  ({ blockNumber: l.blockNumber ?? 0n, logIndex: l.logIndex ?? 0, address: l.args.store, approved: false })),
  ]
  merged.sort((a, b) =>
    a.blockNumber !== b.blockNumber
      ? a.blockNumber < b.blockNumber ? -1 : 1
      : a.logIndex - b.logIndex,
  )
  const stateMap = new Map<string, boolean>()
  const orderMap = new Map<string, number>()
  for (const ev of merged) {
    const key = ev.address.toLowerCase()
    if (!orderMap.has(key)) orderMap.set(key, orderMap.size)
    stateMap.set(key, ev.approved)
  }
  return Array.from(stateMap.entries())
    .sort((a, b) => (orderMap.get(a[0]) ?? 0) - (orderMap.get(b[0]) ?? 0))
    .map(([addr, isApproved]) => ({ address: addr as `0x${string}`, approved: isApproved }))
}

// ─── Event-log derived store list ─────────────────────────────────────────────

interface StoreEntry {
  address: `0x${string}`
  approved: boolean
}

/** Incremental log cache — persists across refresh calls, never reset. */
interface LogCache {
  scannedUpTo: bigint               // last toBlock that was fully scanned
  approvedLogs: StoreLog[]
  revokedLogs: StoreLog[]
}

function useStoreList() {
  const publicClient = usePublicClient({ chainId: CHAIN_ID })
  const [stores, setStores]         = useState<StoreEntry[]>([])
  const [loading, setLoading]       = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Cache persists between renders; initialised once per hook instance.
  const cacheRef   = useRef<LogCache>({ scannedUpTo: DEPLOY_BLOCK - 1n, approvedLogs: [], revokedLogs: [] })
  // Guard against concurrent refresh calls.
  const runningRef = useRef(false)

  const refresh = useCallback(async () => {
    if (!publicClient || runningRef.current) return
    runningRef.current = true
    setLoading(true)
    setFetchError(null)
    try {
      const latestBlock = await publicClient.getBlockNumber()
      const cache = cacheRef.current

      // Only scan blocks we haven't seen yet (incremental).
      const fromBlock = cache.scannedUpTo + 1n
      if (fromBlock <= latestBlock) {
        // Fetch both event types sequentially (not in parallel) to reduce
        // burst pressure against the rate limiter.
        const newApproved = await fetchEventLogsSequential(
          publicClient, STORE_APPROVED_ABI, fromBlock, latestBlock,
        )
        // Brief pause between the two sequential sweeps.
        await sleep(INTER_CHUNK_DELAY_MS)
        const newRevoked  = await fetchEventLogsSequential(
          publicClient, STORE_REVOKED_ABI,  fromBlock, latestBlock,
        )

        cache.approvedLogs = [...cache.approvedLogs, ...newApproved]
        cache.revokedLogs  = [...cache.revokedLogs,  ...newRevoked]
        cache.scannedUpTo  = latestBlock
      }

      // oxlint-disable-next-line react/set-state-in-effect
      setStores(replayEvents(cache.approvedLogs, cache.revokedLogs))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // oxlint-disable-next-line react/set-state-in-effect
      setFetchError(msg)
      // Keep previously derived store list visible even on error.
    } finally {
      // oxlint-disable-next-line react/set-state-in-effect
      setLoading(false)
      runningRef.current = false
    }
  }, [publicClient])

  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    void refresh()
  }, [refresh])

  return { stores, loading, fetchError, refresh }
}

// ─── StoreManager component ────────────────────────────────────────────────────

export function StoreManager() {
  const { address } = useAccount()
  const { t } = useLocale()
  const { isOwner } = useRole(1n)
  const { stores, loading, fetchError, refresh } = useStoreList()
  const [inputAddr, setInputAddr] = useState('')

  const approveStore = useApproveStore()
  const revokeStore = useRevokeStore()

  // ALL hooks must be called unconditionally before any early return

  // Refresh list after successful tx
  useEffect(() => {
    if (approveStore.isSuccess) void refresh()
  }, [approveStore.isSuccess, refresh])

  useEffect(() => {
    if (revokeStore.isSuccess) void refresh()
  }, [revokeStore.isSuccess, refresh])

  // Toast notifications for tx results
  useEffect(() => {
    if (approveStore.isSuccess) toast.success(t('toast.approveStoreSuccess'))
  }, [approveStore.isSuccess, t])

  useEffect(() => {
    if (approveStore.error) toast.error(t('toast.approveStoreError'))
  }, [approveStore.error, t])

  useEffect(() => {
    if (revokeStore.isSuccess) toast.success(t('toast.revokeStoreSuccess'))
  }, [revokeStore.isSuccess, t])

  useEffect(() => {
    if (revokeStore.error) toast.error(t('toast.revokeStoreError'))
  }, [revokeStore.error, t])

  // Guard: owner only (rendered after all hooks)
  if (!isOwner) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <AlertCircle size={36} className="mx-auto mb-4 text-red-300" />
        <p className="text-sm text-gray-500">{t('store.errNotOwner')}</p>
      </div>
    )
  }

  const handleApprove = () => {
    if (!isAddress(inputAddr)) {
      toast.error(t('store.errInvalidAddr'))
      return
    }
    const target = inputAddr
    approveStore.approveStore(target)
    toast.info(t('toast.approveStoreLoading'))
    setInputAddr('')
  }

  const handleRevoke = (store: `0x${string}`) => {
    revokeStore.revokeStore(store)
    toast.info(t('toast.revokeStoreLoading'))
  }

  const approvedCount = stores.filter(s => s.approved).length

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Store size={18} /> {t('store.title')}
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">{t('store.subtitle')}</p>
        </div>
        <button
          onClick={() => { void refresh() }}
          disabled={loading}
          className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors disabled:opacity-40"
          title="Refresh"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Approve form */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">{t('store.approveTitle')}</h3>
        <label className="block text-xs text-gray-600">{t('store.approveLabel')}</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={inputAddr}
            onChange={e => setInputAddr(e.target.value)}
            placeholder={t('store.approvePlaceholder')}
            className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono"
          />
          <button
            onClick={handleApprove}
            disabled={approveStore.isPending || approveStore.isConfirming}
            className="px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50 shrink-0 flex items-center gap-1.5"
          >
            <UserCheck size={14} />
            {approveStore.isPending || approveStore.isConfirming
              ? t('store.approvingButton')
              : t('store.approveButton')}
          </button>
        </div>
        {/* Quick self-approve shortcut */}
        {address && (
          <button
            onClick={() => setInputAddr(address)}
            className="text-xs text-violet-600 hover:underline"
          >
            自分のアドレスを入力 ({address.slice(0, 10)}…)
          </button>
        )}
      </div>

      {/* Store list */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-700">
          {t('store.approvedList')}
          <span className="ml-2 text-xs text-gray-400">{approvedCount}</span>
        </h3>

        {fetchError && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-xs text-red-700 flex items-start gap-2">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>{fetchError}</span>
          </div>
        )}

        {loading && stores.length === 0 && (
          <div className="text-sm text-gray-400 text-center py-8">
            {t('store.loadingList')}
          </div>
        )}

        {!loading && !fetchError && stores.length === 0 && (
          <div className="text-sm text-gray-400 text-center py-8">
            {t('store.noStores')}
          </div>
        )}

        <div className="space-y-2">
          {stores.map(store => {
            const isSelf =
              !!address && store.address.toLowerCase() === address.toLowerCase()
            return (
              <div
                key={store.address}
                className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-colors ${
                  store.approved
                    ? 'border-green-100 bg-green-50/50'
                    : 'border-gray-100 bg-gray-50/50 opacity-60'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-mono text-gray-700 truncate">
                    {store.address}
                    {isSelf && (
                      <span className="ml-1.5 text-violet-600 font-sans">
                        {t('store.selfBadge')}
                      </span>
                    )}
                  </p>
                  <span
                    className={`mt-0.5 inline-block text-xs px-1.5 py-0.5 rounded-full font-medium ${
                      store.approved
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {store.approved
                      ? t('store.statusApproved')
                      : t('store.statusRevoked')}
                  </span>
                </div>
                {store.approved && (
                  <button
                    onClick={() => handleRevoke(store.address)}
                    disabled={revokeStore.isPending || revokeStore.isConfirming}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 disabled:opacity-50 shrink-0 border border-red-100"
                  >
                    <UserX size={12} />
                    {revokeStore.isPending || revokeStore.isConfirming
                      ? t('store.revokingButton')
                      : t('store.revokeButton')}
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {stores.length > 0 && (
          <p className="text-xs text-gray-400 pt-1">{t('store.logNote')}</p>
        )}
      </div>
    </div>
  )
}
