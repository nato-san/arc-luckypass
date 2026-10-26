import { type Address } from 'viem'

// EIP-712 domain and types for redemption challenge signatures
// Must match exactly what LuckyPass.sol computes in redeem()

export const REDEMPTION_TYPEHASH =
  'RedemptionChallenge(uint256 tokenId,address contractAddress,uint256 chainId,uint256 nonce,uint256 timestamp)'

export function buildRedemptionDomain(contractAddress: Address, chainId: number) {
  return {
    name: 'LuckyPass',
    version: '1',
    chainId,
    verifyingContract: contractAddress,
  } as const
}

export const REDEMPTION_TYPES = {
  RedemptionChallenge: [
    { name: 'tokenId', type: 'uint256' },
    { name: 'contractAddress', type: 'address' },
    { name: 'chainId', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'timestamp', type: 'uint256' },
  ],
} as const

export interface RedemptionChallenge {
  tokenId: bigint
  contractAddress: Address
  chainId: bigint
  nonce: bigint
  timestamp: bigint
}

export function buildRedemptionMessage(
  tokenId: bigint,
  contractAddress: Address,
  chainId: number,
  nonce: bigint,
  timestamp: bigint,
): RedemptionChallenge {
  return {
    tokenId,
    contractAddress,
    chainId: BigInt(chainId),
    nonce,
    timestamp,
  }
}

/** Encode the static QR payload — enough to look up the ticket, but not enough to redeem. */
export function buildQrPayload(contractAddress: Address, chainId: number, tokenId: bigint): string {
  return JSON.stringify({ contractAddress, chainId, tokenId: tokenId.toString() })
}

export interface SignedQrPayload {
  contractAddress: Address
  chainId: number
  tokenId: string
  signature: `0x${string}`
  nonce: string
  timestamp: string
}

/** Encode a signed redemption QR payload for the staff scanner to consume. */
export function buildSignedQrPayload(
  contractAddress: Address,
  chainId: number,
  tokenId: bigint,
  signature: `0x${string}`,
  nonce: bigint,
  timestamp: bigint,
): string {
  const payload: SignedQrPayload = {
    contractAddress,
    chainId,
    tokenId: tokenId.toString(),
    signature,
    nonce: nonce.toString(),
    timestamp: timestamp.toString(),
  }
  return JSON.stringify(payload)
}

/** Parse a signed QR payload. Returns null on invalid input. */
export function parseSignedQrPayload(raw: string): SignedQrPayload | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const p = parsed as Record<string, unknown>
    if (
      typeof p['contractAddress'] !== 'string' ||
      typeof p['chainId'] !== 'number' ||
      typeof p['tokenId'] !== 'string' ||
      typeof p['signature'] !== 'string' ||
      typeof p['nonce'] !== 'string' ||
      typeof p['timestamp'] !== 'string'
    ) return null
    return {
      contractAddress: p['contractAddress'] as Address,
      chainId: p['chainId'],
      tokenId: p['tokenId'],
      signature: p['signature'] as `0x${string}`,
      nonce: p['nonce'],
      timestamp: p['timestamp'],
    }
  } catch {
    return null
  }
}

export function parseQrPayload(raw: string): { contractAddress: Address; chainId: number; tokenId: bigint } | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const p = parsed as Record<string, unknown>
    const tokenIdRaw = p['tokenId']
    if (typeof p['contractAddress'] !== 'string' || typeof p['chainId'] !== 'number' || typeof tokenIdRaw !== 'string') return null
    return {
      contractAddress: p['contractAddress'] as Address,
      chainId: p['chainId'],
      tokenId: BigInt(tokenIdRaw),
    }
  } catch {
    return null
  }
}

/** Format a tx hash for display: 0x1234…abcd */
export function shortHash(hash: string | undefined): string {
  if (!hash) return '—'
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`
}

/** Format an address for display: 0x1234…abcd */
export function shortAddress(addr: string | undefined): string {
  if (!addr) return '—'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}
