# S3 photo integration

## Current status

The TypeScript upload signer, browser upload helper, local connection check,
and dev-only CORS configuration script are implemented. They do not deploy AWS
resources or connect the UI's local session to AWS. On October 1, 2026, the local
SSO profile was authenticated and the dev-bucket connection verified. The dev
bucket has a localhost CORS rule; its four Block Public Access settings remain
enabled. The photo API still requires deployment and real authentication.

## Existing buckets

- Development: `studio-stack-photos-dev`, `us-east-2`.
- Production: `studio-stack-photos-prod`, `us-east-2` (never used by local scripts).

## Local connection

Install AWS CLI v2. Copy `.env.example` to `.env.local` if needed. This file is
ignored by Git and contains configuration only, not credentials.

```sh
aws configure sso --profile studiostack-dev
aws sso login --profile studiostack-dev
npm run aws:check
npm run aws:cors:dev
```

The SSO wizard needs your access-portal start URL and Identity Center region,
which may differ from the S3 bucket region. Select the StudioStack account and
your assigned role. SSO tokens stay outside the repository. Both npm scripts
are explicitly restricted to the dev bucket; CORS preserves unrelated rules.

For this account, the portal is `https://d-90662887c3.awsapps.com/start/`, the SSO
region is `us-east-1`, and the S3/client region is `us-east-2`. The local profile
is `studiostack-dev`. Renew an expired session with `aws sso login --profile
studiostack-dev`; no permanent access keys are needed.

## Upload flow

1. `src/api/preparePhoto.ts` processes the selected photo locally (see limits below).
   The browser calls an authenticated photo API with its access token, processed
   MIME type and processed file size. Do not use the demo session as proof of identity.
2. API Gateway validates the token with a JWT authorizer and an appropriate
   photo-upload authorization scope. Lambda uses `backend/photos.ts`'s `handler`.
3. The handler generates a five-minute S3 POST form scoped to a unique object
   key under the verified user's prefix. Processed JPEG and WebP only, up to 10 MiB.
   The signed POST policy enforces the declared content type and exact file size.
4. `src/api/photos.ts` uploads the file and returns its S3 object key. A future
   authenticated backend saves that key alongside the equipment/report in RDS.

In Lambda, configure `AWS_REGION` and `S3_PHOTOS_BUCKET`, not `AWS_PROFILE` or
permanent keys. Its IAM execution role needs only `s3:PutObject` on the intended
bucket's `photos/*` prefix, plus any permissions required by bucket encryption.
Keep Block Public Access enabled. Configure API Gateway CORS for the web origin
separately from S3 CORS. Treat signed upload forms as temporary credentials.

Set `NEXT_PUBLIC_PHOTO_UPLOAD_API_URL` only after deploying the authenticated
endpoint. The current Next.js static export is preserved; no Next.js server API
route or unauthenticated upload service is exposed. There is no AWS deployment,
Cognito setup, RDS persistence, private-photo download API, or photo UI wiring in
this change. Validate real file contents in backend processing before displaying
uploads; a declared MIME type is not proof of file contents.

## Phone photos and processing limits

| Stage | Limit / behavior |
| --- | --- |
| Original selection | 1 byte–50 MiB; JPEG, PNG, WebP, HEIC/HEIF, AVIF |
| Decoded dimensions | At most 50,000,000 pixels, including inspected HEIF auxiliary images |
| Display image | JPEG at 85% quality, at most 2560 pixels on its long edge; never upscaled |
| S3 upload | 1 byte–10 MiB, checked after conversion and enforced by the signed POST policy |

File headers determine input format, not just extension or MIME. Header dimensions
are checked before decoding and actual decoded dimensions checked again. Native
decoding honors image orientation. HEIC/HEIF fall back to a lazy-loaded,
bundled `libheif-js` WASM decoder; AVIF uses a separate `@jsquash/avif` WASM decoder
when native decoding is unavailable. Originals never leave the device. Canvas
re-encoding drops original EXIF/GPS metadata and flattens transparency onto white.
Animated/multi-image inputs become a single display image, not a preserved sequence.

Preparation is serialized to reduce peak memory. Decode/canvas resources are
released; unreadable files, unsupported encodings, memory failures, and outputs
that cannot meet the cap fail instead of silently uploading the original. The
50 MP limit accommodates common 48 MP photos but does not guarantee that every
phone can process a maximum-size file. Test target Safari/Android versions before
shipping; this PR provides the helper, not the camera/file-picker UI integration.
These client-side checks are UX guards, not a substitute for backend inspection.

Fallback codecs load only when needed, not from a CDN. The HEIF bundle is about
2 MB uncompressed; the AVIF decoder asset is about 1.2 MB. `npm run dev` and
`npm run build` generate the AVIF asset in `public/photo-codecs/`; deploy it with
the static export. The build also copies decoder license notices into that folder.
Generated assets are ignored by Git.
`image-size` uses MIT licensing; `libheif-js` uses LGPL-3.0; `@jsquash/avif` uses Apache-2.0.
Preserve their notices and satisfy applicable redistribution requirements when
shipping the bundled decoder. See [libheif-js source and license](https://github.com/catdad-experiments/libheif-js)
and [image-size source](https://github.com/image-size/image-size). AVIF codec:
[jSquash source and notices](https://github.com/jamsinclair/jSquash/tree/main/packages/avif).

References: [SSO setup](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html),
[S3 POST policies](https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-HTTPPOSTConstructPolicy.html),
[CORS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/enabling-cors-examples.html).
