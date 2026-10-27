import { useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { erc20Abi } from 'viem'
import { arcTestnet } from 'viem/chains'
import { LUCKY_PASS_ADDRESS, LUCKY_PASS_ABI } from '@/lib/luckypass-abi'
import { getUsdc } from '@/onchain-facts'

const CHAIN_ID = arcTestnet.id
const usdc = getUsdc(CHAIN_ID)
export const USDC_ADDRESS = usdc?.address as `0x${string}`

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
 * For a winner address on a lot, returns:
 *   { isPaid, tokenId } where tokenId is the first SBT token minted to that address
 * Strategy: isWinner=true and balanceOf>0 confirms purchase.
 * To find the exact tokenId for this lot we check tokenLot(1) up to ticketsMinted.
 * For most use-cases a single lot with a single winner slot is sufficient to check
 * tokenId 1 directly; we do a batch read for up to `ticketsMinted` tokens.
 */
export function useWinnerPurchaseState(
  lotId: bigint | undefined,
  address: `0x${string}` | undefined,
  ticketsMinted: number,
) {
  // Build a batch: ownerOf(1)..ownerOf(ticketsMinted)
  const tokenIds = Array.from({ length: ticketsMinted }, (_, i) => BigInt(i + 1))
  const { data, isLoading, isError, refetch } = useReadContracts({
    contracts: tokenIds.map(tokenId => ({
      address: LUCKY_PASS_ADDRESS,
      abi: LUCKY_PASS_ABI,
      functionName: 'ownerOf' as const,
      args: [tokenId] as const,
      chainId: CHAIN_ID,
    })),
    query: { enabled: !!address && ticketsMinted > 0 && lotId !== undefined },
  })

  // Find the tokenId owned by address that belongs to this lot
  const ownedTokenId: bigint | null = (() => {
    if (!data || !address) return null
    for (let i = 0; i < tokenIds.length; i++) {
      const result = data[i]
      if (result?.status === 'success' && typeof result.result === 'string' &&
          result.result.toLowerCase() === address.toLowerCase()) {
        return tokenIds[i]
      }
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

// ─── Write hooks (each returns writeContract + status) ───────────────────────

export function useEnter() {
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  return {
    enter: (lotId: bigint) =>
      writeContract({ chainId: CHAIN_ID, address: LUCKY_PASS_ADDRESS, abi: LUCKY_PASS_ABI, functionName: 'enter', args: [lotId] }),
    hash, isPending, isConfirming, isSuccess, error,
  }
}

export function useApproveUsdc() {
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  return {
    approve: (amount: bigint) =>
      writeContract({ chainId: CHAIN_ID, address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [LUCKY_PASS_ADDRESS, amount] }),
    hash, isPending, isConfirming, isSuccess, error,
  }
}

export function usePurchase() {
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash })
  return {
    purchase: (lotId: bigint) =>
      writeContract({ chainId: CHAIN_ID, address: LUCKY_PASS_ADDRESS, abi: LUCKY_PASS_ABI, functionName: 'purchase', args: [lotId] }),
    hash, isPending, isConfirming, isSuccess, receipt, error,
  }
}

export function useRedeem() {
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
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
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
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
    hash, isPending, isConfirming, isSuccess, error,
  }
}

export function useRequestDraw() {
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
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
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  return {
    selectWinners: (lotId: bigint) =>
      writeContract({ chainId: CHAIN_ID, address: LUCKY_PASS_ADDRESS, abi: LUCKY_PASS_ABI, functionName: 'selectWinners', args: [lotId] }),
    hash, isPending, isConfirming, isSuccess, error,
  }
}

export function useSetVenueOperator() {
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
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
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
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
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  return {
    approveStore: (store: `0x${string}`) =>
      writeContract({ chainId: CHAIN_ID, address: LUCKY_PASS_ADDRESS, abi: LUCKY_PASS_ABI, functionName: 'approveStore', args: [store] }),
    hash, isPending, isConfirming, isSuccess, error,
  }
}

export function useRevokeStore() {
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
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
