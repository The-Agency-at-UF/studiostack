// Label format: docs/qr-spec.md. Printed labels last for years, so changes here
// must keep every previously printed label parsing the same way.

/** Placeholder until the permanent domain is confirmed; `.invalid` can never resolve, so test prints can't ship by accident. */
export const ITEM_HOST = 'studiostack.invalid'

/** School code, a hyphen, then 4–8 characters from 2–9 and A–Z without I or O. Always uppercase. */
const ASSET_TAG = /^[A-Z]{2,6}-[2-9A-HJ-NP-Z]{4,8}$/

const ITEM_URL = new RegExp(`^https?://${ITEM_HOST.replace(/\./g, '\\.')}/i/([^/?#]+)/*$`, 'i')

export type ScanResult = { kind: 'item'; assetTag: string } | { kind: 'unknown'; raw: string }

/** Uppercase on purpose: an all-uppercase URL fits QR alphanumeric mode, giving a less dense code with larger modules. */
export function buildItemUrl(assetTag: string): string {
  const tag = assetTag.trim().toUpperCase()
  if (!ASSET_TAG.test(tag)) throw new Error(`Invalid asset tag: ${assetTag}`)
  return `HTTPS://${ITEM_HOST.toUpperCase()}/I/${tag}`
}

/** Accepts a camera or USB-scanner read of our URL, or a typed tag from the label. Anything else is unknown. */
export function parseScan(raw: string): ScanResult {
  const text = raw.trim()
  const tag = (ITEM_URL.exec(text)?.[1] ?? text).toUpperCase()
  return ASSET_TAG.test(tag) ? { kind: 'item', assetTag: tag } : { kind: 'unknown', raw }
}
