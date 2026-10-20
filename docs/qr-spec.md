# Equipment QR label format

Status: **draft, awaiting approval by @____.** The domain is a placeholder until confirmed.

Labels are physically stuck onto equipment and will stay in use for years, so this
format is permanent once printed at scale. Legacy labels encode the raw Firestore
document ID, which disappears with the move to Postgres; none of those have been printed
at scale, so they are not supported.

Building and parsing live in [`packages/qr`](../packages/qr/src/index.ts): plain
TypeScript with no React, Expo or DOM dependencies, shared by the web and mobile apps.

## Payload

```
HTTPS://<DOMAIN>/I/<ASSET-TAG>
```

Example: `HTTPS://STUDIOSTACK.INVALID/I/UF-7K3M`

- A URL, so a phone's normal camera app opens the item page; the mobile app can later
  claim the same URL as a deep link.
- **All uppercase on purpose.** An uppercase string fits QR alphanumeric mode, which packs
  more efficiently than byte mode. At level Q this example is a 29×29 code instead of
  33×33, so every module prints about 14% larger at the same label size. The web server
  must therefore route `/I/<tag>` as well as `/i/<tag>`, case-insensitively.
- No query string or fragment. Anything after the tag (other than trailing slashes) makes
  the scan `unknown`.

## Domain

**To confirm with @____ before finalizing.** The domain is printed permanently, so it must
be one we will control long-term, independent of any one team, hosting provider or
student project. Keep it to 21 characters or fewer, so even the longest tag stays a 29×29
code at level Q.

Until confirmed, `ITEM_HOST` in `packages/qr` is `studiostack.invalid`. The `.invalid`
top-level domain can never resolve, so test labels can't accidentally ship.

## Asset tag

```
<SCHOOL>-<CODE>      e.g. UF-7K3M
```

| Part | Rule |
| --- | --- |
| `SCHOOL` | 2–6 letters `A–Z`, assigned once per organization (`UF`, `FSU`, …). |
| `CODE` | 4–8 characters from `2–9` and `A–Z` excluding `I` and `O` (32 symbols), so `0/O` and `1/I` can't be confused on a scuffed label. 4 characters give about 1M tags per school. |

- Unique across **all** schools: the school prefix makes tags globally unique as long as
  codes are unique within a school.
- Not the database ID. A tag is assigned once and never reused, even after the item is
  retired.
- Case-insensitive; the canonical form is uppercase.

### Gaps in the current schema (follow-up ticket)

`app.inventory.equipment_code` (`backend/database/migrations/002_inventory_and_reservations.sql`)
is the natural home for the tag, but today it:

- is unique only per organization, not globally;
- is case-sensitive;
- allows up to 128 characters of `a-zA-Z0-9._-`.

It needs a case-insensitive global unique index and the pattern above. The add-item flow
also currently rejects scanned URLs (`docs/inventory-capture.md`); it should call
`parseScan` instead.

## Printing

| Property | Value |
| --- | --- |
| Error correction | **Q** (about 25% recoverable). Labels get scuffed. |
| Minimum code size | **20 × 20 mm** (about 0.7 mm per module at 29×29), not counting the quiet zone. *To verify with the test-print acceptance check.* |
| Quiet zone | 4 modules of blank space on every side (about 3 mm). |
| Human-readable text | The asset tag (`UF-7K3M`) centered under the code in a bold sans-serif at least 8 pt, so staff can type it when a code won't scan. The domain is not printed. |

## Parsing (`parseScan`)

`parseScan(raw)` returns `{ kind: "item", assetTag }` with the tag uppercased, or
`{ kind: "unknown", raw }` with the input unchanged. It accepts:

- surrounding whitespace and a trailing newline or CRLF (USB scanners type the code and then press Enter);
- `http` or `https`, in any letter case;
- one or more trailing slashes;
- a bare tag such as `uf-7k3m`, so manual entry shares the same validation.

Everything else is `unknown`: other domains, look-alike hosts (`<domain>.evil.com`),
other paths, extra path segments, query strings, invalid tags, and non-URL QR codes such
as Wi-Fi codes.

`buildItemUrl(tag)` produces the canonical uppercase URL and throws on an invalid tag.

## Scan states the UI must handle

Shared with the wireframe ticket owner.

| State | When |
| --- | --- |
| Success | Tag found and valid for this action. |
| Not in this reservation | Valid item that isn't part of the reservation being checked out or in. |
| Unknown code | `parseScan` returned `unknown` (not a StudioStack label). |
| Item not found | Our format, but no such tag exists or it belongs to another school. |
| Reported / broken item | Item has an open damage report or is out of service. |
| Duplicate scan | Item already scanned in this session; continuous scanning makes this common. |
| Camera denied / unavailable | Permission refused, no camera, or not served over HTTPS. |
| Manual entry | Tag typed from the label text; goes through `parseScan` like a scan. |

## Still open

- Domain confirmation and spec approval by @____.
- Web scanner library spike (html5-qrcode, @zxing/browser, qr-scanner, barcode-detector
  polyfill) on iOS Safari, Android Chrome and desktop Chrome.
- Confirm Expo's camera reads the uppercase URL.
- Confirm the production closet's USB scanner reads QR codes (not 1D-only), and record
  exactly what it sends.
- Test-print labels at the minimum size and scan them with a phone camera and the USB scanner.
