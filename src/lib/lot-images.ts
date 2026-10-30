// Lot image URL storage — client-side only (localStorage).
// Images are NOT stored onchain. Clearing browser data will remove them.
// Key format: luckypass-lot-image-<lotId>

const KEY_PREFIX = 'luckypass-lot-image-'

export function getLotImage(lotId: bigint | number): string | null {
  try {
    return localStorage.getItem(`${KEY_PREFIX}${lotId}`) ?? null
  } catch {
    return null
  }
}

export function setLotImage(lotId: bigint | number, url: string) {
  try {
    if (url.trim()) {
      localStorage.setItem(`${KEY_PREFIX}${lotId}`, url.trim())
    } else {
      localStorage.removeItem(`${KEY_PREFIX}${lotId}`)
    }
  } catch { /* ignore */ }
}
