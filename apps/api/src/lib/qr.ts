import QRCode from 'qrcode'
import { env } from '../config/env.js'

// The public verification URL a printed dossier's QR code points at — the
// web app's /verify/:hash page, which calls GET /applications/verify/:hash.
export function verificationUrl(signatureHash: string): string {
  return `${env.PUBLIC_WEB_URL.replace(/\/$/, '')}/verify/${signatureHash}`
}

// Rendered server-side as an inline SVG string, so the web app ships no
// QR library (target device: a ₹6,000 phone on 2G — every KB counts) and
// the printed page needs no extra network request. Error-correction M
// survives a slightly smudged printout.
export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, width: 132 })
}
