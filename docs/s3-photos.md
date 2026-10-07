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

1. The browser calls an authenticated photo API with its access token, MIME type,
   and file size. Do not use the local demo session as proof of identity.
2. API Gateway validates the token with a JWT authorizer and an appropriate
   photo-upload authorization scope. Lambda uses `backend/photos.ts`'s `handler`.
3. The handler generates a five-minute S3 POST form scoped to a unique object
   key under the verified user's prefix. JPEG, PNG, and WebP only, up to 10 MiB.
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

References: [SSO setup](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html),
[S3 POST policies](https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-HTTPPOSTConstructPolicy.html),
[CORS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/enabling-cors-examples.html).
