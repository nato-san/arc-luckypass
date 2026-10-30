import { useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { useQueryClient, type Query } from '@tanstack/react-query'
import { erc20Abi } from 'viem'
import { arcTestnet } from 'viem/chains'
import { LUCKY_PASS_ADDRESS, LUCKY_PASS_ABI } from '@/lib/luckypass-abi'
import { getUsdc } from '@/onchain-facts'
import { useEffect } from 'react'

const CHAIN_ID = arcTestnet.id
const usdc = getUsdc(CHAIN_ID)
export const USDC_ADDRESS = usdc?.address as `0x${string}`

// ─── Query invalidation helpers ───────────────────────────────────────────────
// wagmi v2 stores readContract results under:
//   ['readContract', { chainId, address, functionName, args, ... }]
// TanStack Query v5 invalidateQueries({ queryKey }) does DEEP EQUAL on each
// element — a partial object like { functionName } does NOT match.
// We use `predicate` to match by functionName (and optionally address) so that
// every variant (different args/lotIds) of a given function is invalidated at
// once. This is the only reliable approach without reconstructing every exact key.

type AnyRecord = Record<string, unknown>

function byFn(fns: string[], addr?: string) {
  return {
    predicate: (q: Query) => {
      const k = q.queryKey
      if (!Array.isArray(k) || k[0] !== 'readContract') return false
      const meta = k[1] as AnyRecord | undefined
      if (!meta) return false
      if (addr && (meta['address'] as string | undefined)?.toLowerCase() !== addr.toLowerCase()) return false
      return fns.includes(meta['functionName'] as string)
    },
  }
}

// ─── Lot data ─────────────────────────────────────────────────────────────────

export function useLotCount() {
  return useReadContract({
    address: LUCKY_PASS_ADDRESS,
    abi: LUCKY_PASS_ABI,
    functionName: 'lotCount',
    chainId: CHAIN_ID,
  })
}

export function useLot(lotId: bigint | undefined) {
  return useReadContract({
    address: LUCKY_PASS_ADDRESS,
    abi: LUCKY_PASS_ABI,
    functionName: 'getLot',
    args: lotId !== undefined ? [lotId] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: lotId !== undefined },
  })
}

export function useHasEntered(lotId: bigint | undefined, address: `0x${string}` | undefined) {
  return useReadContract({
    address: LUCKY_PASS_ADDRESS,
    abi: LUCKY_PASS_ABI,
    functionName: 'hasEntered',
    args: lotId !== undefined && address ? [lotId, address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: lotId !== undefined && !!address },
  })
}

export function useIsWinner(lotId: bigint | undefined, address: `0x${string}` | undefined) {
  return useReadContract({
    address: LUCKY_PASS_ADDRESS,
    abi: LUCKY_PASS_ABI,
    functionName: 'isWinner',
    args: lotId !== undefined && address ? [lotId, address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: lotId !== undefined && !!address },
  })
}

/**
 * Returns the ERC-721 SBT balance for an address.
 * balanceOf > 0 means the address already owns at least one ticket SBT.
 */
export function useSbtBalance(address: `0x${string}` | undefined) {
  return useReadContract({
    address: LUCKY_PASS_ADDRESS,
    abi: LUCKY_PASS_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address },
  })
}

/**
 * For a winner address on a lot, returns whether they have already purchased
 * an SBT for THIS specific lot, and which tokenId they own.
 *
 * Strategy: batch-read ownerOf(1..ticketsMinted) AND tokenLot(1..ticketsMinted).
 * A token belongs to the connected address AND this lot when both conditions hold:
 *   ownerOf(tokenId) === address  AND  tokenLot(tokenId) === lotId
 * This prevents false-positives from SBTs belonging to a different lot.
 */
export function useWinnerPurchaseState(
  lotId: bigint | undefined,
  address: `0x${string}` | undefined,
  ticketsMinted: number,
) {
  const tokenIds = Array.from({ length: ticketsMinted }, (_, i) => BigInt(i + 1))
  const enabled = !!address && ticketsMinted > 0 && lotId !== undefined

  // Batch: ownerOf + tokenLot for each minted token
  const { data, isLoading, isError, refetch } = useReadContracts({
    contracts: tokenIds.flatMap(tokenId => [
      {
        address: LUCKY_PASS_ADDRESS,
        abi: LUCKY_PASS_ABI,
        functionName: 'ownerOf' as const,
        args: [tokenId] as const,
        chainId: CHAIN_ID,
      },
      {
        address: LUCKY_PASS_ADDRESS,
        abi: LUCKY_PASS_ABI,
        functionName: 'tokenLot' as const,
        args: [tokenId] as const,
        chainId: CHAIN_ID,
      },
    ]),
    query: { enabled },
  })

  /**
   * Find the tokenId where:
   *   ownerOf(tokenId) === address  AND  tokenLot(tokenId) === lotId
   * Results are interleaved: index 2*i = ownerOf result, 2*i+1 = tokenLot result.
   */
  const ownedTokenId: bigint | null = (() => {
    if (!data || !address || !lotId) return null
    for (let i = 0; i < tokenIds.length; i++) {
      const ownerResult = data[2 * i]
      const lotResult   = data[2 * i + 1]
      const ownerMatch = ownerResult?.status === 'success' &&
        typeof ownerResult.result === 'string' &&
        ownerResult.result.toLowerCase() === address.toLowerCase()
      const lotMatch = lotResult?.status === 'success' &&
        typeof lotResult.result === 'bigint' &&
        lotResult.result === lotId
      if (ownerMatch && lotMatch) return tokenIds[i]
    }
    return null
  })()

  return {
    isPurchased: ownedTokenId !== null,
    tokenId: ownedTokenId,
    isLoading,
    isError,
    refetch,
  }
}

export function usePaymentDeadline(lotId: bigint | undefined, slot: number | undefined) {
  return useReadContract({
    address: LUCKY_PASS_ADDRESS,
    abi: LUCKY_PASS_ABI,
    functionName: 'paymentDeadline',
    args: lotId !== undefined && slot !== undefined ? [lotId, slot] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: lotId !== undefined && slot !== undefined },
  })
}

export function useContractOwner() {
  return useReadContract({
    address: LUCKY_PASS_ADDRESS,
    abi: LUCKY_PASS_ABI,
    functionName: 'owner',
    chainId: CHAIN_ID,
  })
}

export function useIsVenueOperator(lotId: bigint | undefined, address: `0x${string}` | undefined) {
  return useReadContract({
    address: LUCKY_PASS_ADDRESS,
    abi: LUCKY_PASS_ABI,
    functionName: 'isVenueOperator',
    args: lotId !== undefined && address ? [lotId, address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: lotId !== undefined && !!address },
  })
}

export function useEntrantCount(lotId: bigint | undefined) {
  return useReadContract({
    address: LUCKY_PASS_ADDRESS,
    abi: LUCKY_PASS_ABI,
    functionName: 'entrantCount',
    args: lotId !== undefined ? [lotId] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: lotId !== undefined },
  })
}

export function useWaitlistLength(lotId: bigint | undefined) {
  return useReadContract({
    address: LUCKY_PASS_ADDRESS,
    abi: LUCKY_PASS_ABI,
    functionName: 'waitlistLength',
    args: lotId !== undefined ? [lotId] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: lotId !== undefined },
  })
}

export function useDomainSeparator() {
  return useReadContract({
    address: LUCKY_PASS_ADDRESS,
    abi: LUCKY_PASS_ABI,
    functionName: 'domainSeparator',
    chainId: CHAIN_ID,
  })
}

export function useRedemptionNonce(tokenId: bigint | undefined) {
  return useReadContract({
    address: LUCKY_PASS_ADDRESS,
    abi: LUCKY_PASS_ABI,
    functionName: 'redemptionNonce',
    args: tokenId !== undefined ? [tokenId] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: tokenId !== undefined },
  })
}

export function useTicketInfo(tokenId: bigint | undefined) {
  return useReadContract({
    address: LUCKY_PASS_ADDRESS,
    abi: LUCKY_PASS_ABI,
    functionName: 'getTicketInfo',
    args: tokenId !== undefined ? [tokenId] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: tokenId !== undefined },
  })
}

// ─── USDC allowance ───────────────────────────────────────────────────────────

export function useUsdcAllowance(owner: `0x${string}` | undefined) {
  return useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: owner ? [owner, LUCKY_PASS_ADDRESS] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!owner },
  })
}

// ─── Write hooks ──────────────────────────────────────────────────────────────
// Each write hook:
//   1. Exposes isPending (wallet signing) + isConfirming (waiting for receipt)
//   2. On isSuccess, invalidates the relevant read queries so wagmi refetches them
//      automatically — no manual refetch() calls needed in components.

export function useEnter() {
  const { address } = useAccount()
  const qc = useQueryClient()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (!isSuccess || !hash) return
    // hasEntered, entrantCount — by functionName predicate (args-agnostic)
    void qc.invalidateQueries(byFn(['hasEntered', 'entrantCount'], LUCKY_PASS_ADDRESS))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])

  return {
    enter: (lotId: bigint) =>
      writeContract({ chainId: CHAIN_ID, address: LUCKY_PASS_ADDRESS, abi: LUCKY_PASS_ABI, functionName: 'enter', args: [lotId] }),
    hash, isPending, isConfirming, isSuccess, error,
  }
}

export function useApproveUsdc() {
  const qc = useQueryClient()
  const { address } = useAccount()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (!isSuccess || !hash) return
    void qc.invalidateQueries(byFn(['allowance'], USDC_ADDRESS))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])

  return {
    approve: (amount: bigint) =>
      writeContract({ chainId: CHAIN_ID, address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [LUCKY_PASS_ADDRESS, amount] }),
    hash, isPending, isConfirming, isSuccess, error,
  }
}

export function usePurchase() {
  const qc = useQueryClient()
  const { address } = useAccount()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (!isSuccess || !hash) return
    // ownerOf + tokenLot (useWinnerPurchaseState batch), isWinner, getLot (ticketsMinted++)
    void qc.invalidateQueries(byFn(['ownerOf', 'tokenLot', 'isWinner', 'getLot'], LUCKY_PASS_ADDRESS))
    void qc.invalidateQueries(byFn(['allowance'], USDC_ADDRESS))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])

  return {
    purchase: (lotId: bigint) =>
      writeContract({ chainId: CHAIN_ID, address: LUCKY_PASS_ADDRESS, abi: LUCKY_PASS_ABI, functionName: 'purchase', args: [lotId] }),
    hash, isPending, isConfirming, isSuccess, receipt, error,
  }
}

export function useRedeem() {
  const qc = useQueryClient()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (!isSuccess || !hash) return
    // ownerOf + tokenLot (useWinnerPurchaseState), getTicketInfo (isRedeemed), redemptionNonce, getLot
    void qc.invalidateQueries(byFn(['ownerOf', 'tokenLot', 'getTicketInfo', 'redemptionNonce', 'getLot'], LUCKY_PASS_ADDRESS))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])

  return {
    redeem: (tokenId: bigint, signature: `0x${string}`, nonce: bigint, timestamp: bigint) =>
      writeContract({
        chainId: CHAIN_ID, address: LUCKY_PASS_ADDRESS, abi: LUCKY_PASS_ABI, functionName: 'redeem',
        args: [tokenId, signature, nonce, timestamp],
      }),
    hash, isPending, isConfirming, isSuccess, error,
  }
}

// Operator-only write hooks
export function useCreateLot() {
  const qc = useQueryClient()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (!isSuccess || !hash) return
    void qc.invalidateQueries(byFn(['lotCount'], LUCKY_PASS_ADDRESS))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])

  return {
    createLot: (
      name: string, description: string, priceUsdc: bigint,
      supply: number, paymentWindow: bigint, maxEntrants: number,
      entryOpenAt: bigint, entryCloseAt: bigint, fixedDeadlineAt: bigint,
    ) => writeContract({
      chainId: CHAIN_ID, address: LUCKY_PASS_ADDRESS, abi: LUCKY_PASS_ABI, functionName: 'createLot',
      args: [name, description, priceUsdc, supply, paymentWindow, maxEntrants,
             entryOpenAt, entryCloseAt, fixedDeadlineAt],
    }),
    hash, isPending, isConfirming, isSuccess, receipt, error,
  }
}

export function useRequestDraw() {
  const qc = useQueryClient()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (!isSuccess || !hash) return
    // Lot state OPEN → DRAWING; entrantCount finalised
    void qc.invalidateQueries(byFn(['getLot', 'entrantCount'], LUCKY_PASS_ADDRESS))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])

  return {
    requestDraw: (lotId: bigint, vrfFeeWei: bigint) =>
      writeContract({
        chainId: CHAIN_ID, address: LUCKY_PASS_ADDRESS, abi: LUCKY_PASS_ABI, functionName: 'requestDraw',
        args: [lotId], value: vrfFeeWei,
      }),
    hash, isPending, isConfirming, isSuccess, error,
  }
}

export function useSelectWinners() {
  const qc = useQueryClient()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (!isSuccess || !hash) return
    // Lot state → ACTIVE; isWinner changes for all participants
    void qc.invalidateQueries(byFn(['getLot', 'isWinner'], LUCKY_PASS_ADDRESS))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])

  return {
    selectWinners: (lotId: bigint) =>
      writeContract({ chainId: CHAIN_ID, address: LUCKY_PASS_ADDRESS, abi: LUCKY_PASS_ABI, functionName: 'selectWinners', args: [lotId] }),
    hash, isPending, isConfirming, isSuccess, error,
  }
}

export function useSetVenueOperator() {
  const qc = useQueryClient()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (!isSuccess || !hash) return
    void qc.invalidateQueries(byFn(['isVenueOperator'], LUCKY_PASS_ADDRESS))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])

  return {
    setVenueOperator: (lotId: bigint, operator: `0x${string}`, authorized: boolean) =>
      writeContract({
        chainId: CHAIN_ID, address: LUCKY_PASS_ADDRESS, abi: LUCKY_PASS_ABI, functionName: 'setVenueOperator',
        args: [lotId, operator, authorized],
      }),
    hash, isPending, isConfirming, isSuccess, error,
  }
}

export function usePromoteWaitlist() {
  const qc = useQueryClient()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (!isSuccess || !hash) return
    void qc.invalidateQueries(byFn(['isWinner', 'getLot'], LUCKY_PASS_ADDRESS))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])

  return {
    promoteWaitlist: (lotId: bigint, winnerSlot: number) =>
      writeContract({
        chainId: CHAIN_ID, address: LUCKY_PASS_ADDRESS, abi: LUCKY_PASS_ABI, functionName: 'promoteWaitlist',
        args: [lotId, winnerSlot],
      }),
    hash, isPending, isConfirming, isSuccess, error,
  }
}

// ─── Store approval ───────────────────────────────────────────────────────────

export function useIsApprovedStore(address: `0x${string}` | undefined) {
  return useReadContract({
    address: LUCKY_PASS_ADDRESS,
    abi: LUCKY_PASS_ABI,
    functionName: 'isApprovedStore',
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address },
  })
}

export function useApproveStore() {
  const qc = useQueryClient()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (!isSuccess || !hash) return
    void qc.invalidateQueries(byFn(['isApprovedStore'], LUCKY_PASS_ADDRESS))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])

  return {
    approveStore: (store: `0x${string}`) =>
      writeContract({ chainId: CHAIN_ID, address: LUCKY_PASS_ADDRESS, abi: LUCKY_PASS_ABI, functionName: 'approveStore', args: [store] }),
    hash, isPending, isConfirming, isSuccess, error,
  }
}

export function useRevokeStore() {
  const qc = useQueryClient()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (!isSuccess || !hash) return
    void qc.invalidateQueries(byFn(['isApprovedStore'], LUCKY_PASS_ADDRESS))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])

  return {
    revokeStore: (store: `0x${string}`) =>
      writeContract({ chainId: CHAIN_ID, address: LUCKY_PASS_ADDRESS, abi: LUCKY_PASS_ABI, functionName: 'revokeStore', args: [store] }),
    hash, isPending, isConfirming, isSuccess, error,
  }
}

// ─── Role detection ───────────────────────────────────────────────────────────

export function useRole(lotId?: bigint) {
  const { address } = useAccount()
  const { data: ownerAddr } = useContractOwner()
  const { data: isOperator } = useIsVenueOperator(lotId, address)
  const { data: isWinnerAddr } = useIsWinner(lotId, address)
  const { data: approvedStore } = useIsApprovedStore(address)

  const isOwner = !!address && !!ownerAddr && address.toLowerCase() === ownerAddr.toLowerCase()
  const isApprovedStore = !!approvedStore
  // can manage = platform admin OR approved merchant
  const canManage = isOwner || isApprovedStore

  return { isOwner, isApprovedStore, canManage, isOperator: !!isOperator, isWinner: !!isWinnerAddr, address }
}
