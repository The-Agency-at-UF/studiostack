import { describe, expect, it } from 'vitest'
import { buildItemUrl, ITEM_HOST, parseScan } from './index'

const host = ITEM_HOST.toUpperCase()
const item = (assetTag: string) => ({ kind: 'item', assetTag })

describe('buildItemUrl', () => {
  it('builds an all-uppercase https URL', () => {
    expect(buildItemUrl('UF-7K3M')).toBe(`HTTPS://${host}/I/UF-7K3M`)
  })

  it('normalizes case and whitespace', () => {
    expect(buildItemUrl(' uf-7k3m ')).toBe(`HTTPS://${host}/I/UF-7K3M`)
  })

  it('only uses QR alphanumeric-mode characters', () => {
    expect(buildItemUrl('FSU-ABCD2345')).toMatch(/^[0-9A-Z $%*+\-./:]+$/)
  })

  it.each(['', 'UF', 'UF-', '7K3M', 'UF-7K3', 'UF-7K3M9QXYZ', 'UF-7K0M', 'UF-7KOM', 'UF-1K3M', 'UF-IK3M', 'UF_7K3M', 'U-7K3M', 'UFLORIDA-7K3M', 'UF-7K3M/x'])('rejects invalid tag %j', tag => {
    expect(() => buildItemUrl(tag)).toThrow('Invalid asset tag')
  })

  it('round-trips through parseScan', () => {
    expect(parseScan(buildItemUrl('uf-7k3m'))).toEqual(item('UF-7K3M'))
  })
})

describe('parseScan', () => {
  it.each([
    [`HTTPS://${host}/I/UF-7K3M`, 'exact printed URL'],
    [`https://${ITEM_HOST}/i/uf-7k3m`, 'lowercase'],
    [`hTTps://${ITEM_HOST}/I/Uf-7K3m`, 'mixed case'],
    [`http://${ITEM_HOST}/i/UF-7K3M`, 'http'],
    [`https://${ITEM_HOST}/i/UF-7K3M/`, 'trailing slash'],
    [`https://${ITEM_HOST}/i/UF-7K3M//`, 'several trailing slashes'],
    [`HTTPS://${host}/I/UF-7K3M\n`, 'USB scanner trailing newline'],
    [`HTTPS://${host}/I/UF-7K3M\r\n`, 'USB scanner CRLF'],
    [`  \tHTTPS://${host}/I/UF-7K3M  `, 'surrounding whitespace'],
    ['UF-7K3M', 'bare tag'],
    [' uf-7k3m\n', 'typed tag'],
  ])('reads %j (%s)', raw => {
    expect(parseScan(raw)).toEqual(item('UF-7K3M'))
  })

  it.each([
    '',
    '   ',
    'https://example.com/i/UF-7K3M',
    `https://${ITEM_HOST}.evil.com/i/UF-7K3M`,
    `https://evil.com/${ITEM_HOST}/i/UF-7K3M`,
    `https://${ITEM_HOST}/x/UF-7K3M`,
    `https://${ITEM_HOST}/i/`,
    `https://${ITEM_HOST}/i/UF-7K3M/extra`,
    `https://${ITEM_HOST}/i/UF-7K3M?ref=1`,
    `https://${ITEM_HOST}/i/UF-0O1I`,
    `ftp://${ITEM_HOST}/i/UF-7K3M`,
    `${ITEM_HOST}/i/UF-7K3M`,
    'k3hT9xQ2mZpL0aBcDeFg',
    'WIFI:S:studio;T:WPA;P:secret;;',
  ])('returns unknown for %j', raw => {
    expect(parseScan(raw)).toEqual({ kind: 'unknown', raw })
  })
})
