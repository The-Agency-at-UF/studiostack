# Inventory QR and photo capture preview

The add-item dialog supports camera QR scanning, manual equipment IDs, camera/file
photo selection, processed previews and inline validation. Camera access requires
HTTPS or localhost and explicit browser permission. Unavailable cameras offer a
manual fallback; closing/unmounting stops the scanner. Scanned website links and
invalid/duplicate equipment IDs are rejected rather than overwriting an existing item.

Photo processing reuses the already-merged PR #43 helpers: accepted phone-photo
inputs are decoded, bounded, resized and converted before uploading. Original
selection supports up to 50 MiB; processed uploads must fit the 10 MiB limit.
Preview object URLs are revoked and stale asynchronous results are ignored.

This is not the completed authenticated inventory/photo integration. Inventory
still uses the local preview adapter. Photo previews do not upload automatically.
Submitting a photo fails with a clear connection message unless the older uploader
is explicitly configured with an endpoint and real access-token callback. The new
organization-scoped private-photo contract is a separate helper and must be wired
to real inventory persistence before enabling live uploads on these screens.

```sh
npm test -- src/components/EquipmentQrScanner.test.tsx src/views/Equipment/Inventory.test.tsx
npm run typecheck
npm run build
```
