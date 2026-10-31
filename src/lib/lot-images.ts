// Lot image URL storage — two-tier lookup:
//
//  Tier 1 (cross-device): description field on-chain, encoded as JSON:
//    { "d": "<plain description text>", "img": "<image URL>" }
//    When the description is plain text (not JSON / missing img key), it is used as-is.
//
//  Tier 2 (same-browser fallback): localStorage key "luckypass-lot-image-<lotId>"
//    Used for existing lots whose descriptions are plain text, or as an override.
//
// getLotImage() checks Tier 1 first (from the description argument), then Tier 2.
// setLotImage() writes to Tier 2 only (for the existing per-lot image editor in LotRow).
// encodeDescription() / decodeDescription() are used by CreateLotForm to embed the image.

const KEY_PREFIX = 'luckypass-lot-image-'

// ─── Description JSON codec ───────────────────────────────────────────────────

interface DescPayload {
  /** Plain-text description shown to buyers. */
  d: string
  /** Optional product image URL. */
  img?: string
}

/**
 * Try to parse a JSON-encoded description.
 * Returns null if the description is plain text or malformed JSON.
 */
function parseDescPayload(description: string): DescPayload | null {
  const trimmed = description.trim()
  if (!trimmed.startsWith('{')) return null
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'd' in parsed &&
      typeof (parsed as Record<string, unknown>).d === 'string'
    ) {
      return parsed as DescPayload
    }
  } catch { /* not valid JSON */ }
  return null
}

/**
 * Encode a plain description and optional image URL into the JSON format
 * that is stored in the on-chain description field.
 * If imageUrl is empty, returns the plain description unchanged.
 */
export function encodeDescription(plainDesc: string, imageUrl: string): string {
  if (!imageUrl.trim()) return plainDesc
  const payload: DescPayload = { d: plainDesc }
  if (imageUrl.trim()) payload.img = imageUrl.trim()
  return JSON.stringify(payload)
}

/**
 * Decode an on-chain description.
 * Returns { text, imageUrl } — text is always the display string,
 * imageUrl is null when no image is embedded.
 */
export function decodeDescription(description: string): { text: string; imageUrl: string | null } {
  const payload = parseDescPayload(description)
  if (payload) {
    return { text: payload.d, imageUrl: payload.img ?? null }
  }
  return { text: description, imageUrl: null }
}

// ─── Image URL resolution ─────────────────────────────────────────────────────

/**
 * Resolve the product image URL for a lot.
 *
 * Priority:
 *  1. Image URL embedded in the on-chain description (cross-device, works on iPhone).
 *  2. localStorage entry for this lotId (same-browser fallback / override).
 *
 * @param lotId  - The lot ID (bigint or number).
 * @param description - Optional on-chain description string from useLot().
 */
export function getLotImage(lotId: bigint | number, description?: string | null): string | null {
  // Tier 1: on-chain description
  if (description) {
    const { imageUrl } = decodeDescription(description)
    if (imageUrl) return imageUrl
  }
  // Tier 2: localStorage
  try {
    return localStorage.getItem(`${KEY_PREFIX}${lotId}`) ?? null
  } catch {
    return null
  }
}

/**
 * Persist an image URL to localStorage (Tier 2).
 * Used by the LotRow image editor for existing lots.
 */
export function setLotImage(lotId: bigint | number, url: string) {
  try {
    if (url.trim()) {
      localStorage.setItem(`${KEY_PREFIX}${lotId}`, url.trim())
    } else {
      localStorage.removeItem(`${KEY_PREFIX}${lotId}`)
    }
  } catch { /* ignore */ }
}
