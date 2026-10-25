import QRCode from 'qrcode'

/**
 * Generate a QR code as a data URL (PNG).
 * Returns null on error.
 */
export async function generateQrDataUrl(content: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(content, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 256,
      color: { dark: '#111827', light: '#ffffff' },
    })
  } catch {
    return null
  }
}
