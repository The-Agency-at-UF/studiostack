# Organization-scoped private photos

This extends the [database API MVP](database-api.md); it does not repeat the
phone-photo preparation and basic presigned-upload work already merged in PR #43.
It does not activate production or connect inventory screens to live persistence.

## Flow

1. An active organization owner/admin requests `POST /photos/uploads` with the
   organization UUID, processed JPEG/WebP type, exact size and idempotency key.
2. The API returns a five-minute, exact-sized presigned POST for a staging key.
   The browser posts the bytes directly to private S3; no AWS credentials enter it.
3. `POST /organizations/{organizationId}/photos/{photoId}/complete` verifies the
   actual signature, decoded image, dimensions and size, then re-encodes a stripped
   JPEG under the organization’s private photo prefix.
4. Inventory creation/update attaches only a completed photo from that organization.
   Tenant foreign keys, row-level security and restricted grants enforce separation.
5. An active member requests `GET /organizations/{organizationId}/inventory/{itemId}/photo`
   to receive a 60-second signed download. Unattached/pending photos are unavailable.

The original selected image may be up to 50 MiB under PR #43’s processing rules.
This API accepts only the processed JPEG/WebP, 1 byte–10 MiB. Stored display images
are JPEG. Location/other original metadata is not preserved in display photos.

`src/api/privatePhotos.ts` implements this newer completion/attachment contract.
`src/api/photos.ts` remains the older basic uploader and is not interchangeable.
Unlinking a photo does not delete its S3 object; retention/deletion jobs are separate.

## Verification and packaging

```sh
npm run typecheck
npm run test:database
npx vitest run src/api/photo-storage.test.ts
npm run test:database:postgres
npm run build
```

Migration `003_private_photos.sql` and the reviewed grants are maintenance-only.
Runtime permissions must be scoped to the matching staging/display prefixes.
The packaging script creates fresh archives, includes the public RDS CA, and
installs Linux ARM64/glibc Sharp binaries for the deployed Lambda—not macOS binaries.
No environment files, credential caches or photo data are committed.

The subsequent dev rollout PR supplies scoped S3 networking/permissions and records
live authenticated checks. This code PR itself performs no cloud changes.
