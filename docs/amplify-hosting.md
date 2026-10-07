# Amplify frontend hosting

This configuration prepares StudioStack for Amplify Hosting; it does not create
an Amplify app or deploy backend resources. The API can be hosted separately on
EC2 or Lambda. S3, Cognito, and RDS are not provisioned by this build.

## Connect the repository

1. Open Amplify Hosting in `us-east-2` (Ohio) and connect GitHub.
2. Authorize the regional AWS Amplify GitHub app for
   `The-Agency-at-UF/studiostack`. Organization-owner approval may be required.
3. Select the branch containing `amplify.yml`. Initially this is
   `feat/amplify-hosting`; after merging, select `main`.
4. Leave **My app is a monorepo** unchecked. The active application and
   `package.json` are at the repository root, not under `legacy/`.
5. Use frontend-only **static hosting** (`WEB` platform), not Next.js SSR
   compute (`WEB_COMPUTE`). The branch framework is `Next.js - SSG`.
6. Confirm Amplify uses the repository's `amplify.yml`: Node.js 22,
   `npm ci --include=dev`, `npm run build`, and artifact directory `out`.
7. Review the settings and costs before choosing **Save and deploy**.

The current `next.config.mjs` has `output: 'export'` and `trailingSlash: true`.
Every exported route has its own HTML file. Do not add a blanket SPA rewrite to
`/index.html`; verify direct visits and refreshes on routes such as
`/reservations/`, `/inventory/`, and `/statistics/` after deployment.

## If Amplify detects SSR instead

Amplify may detect `next build` as SSR and suggest `.next` artifacts. This
configuration deliberately publishes `out` as a static website. The
`amplify.yml` file does not change the app's platform by itself.

For an existing app, AWS documents these commands to switch to static hosting.
Replace both placeholders with your actual app ID and connected branch; do not
run them against an unrelated app:

```sh
aws amplify update-app --app-id YOUR_APP_ID --platform WEB --region us-east-2
aws amplify update-branch --app-id YOUR_APP_ID --branch-name YOUR_BRANCH --framework 'Next.js - SSG' --region us-east-2
```

See the [AWS Amplify static-hosting troubleshooting guide](https://github.com/aws-amplify/amplify-hosting/blob/main/FAQ.md#convert-an-ssr-app-to-ssg).

## Updates and connection problems

Once the branch is connected and automatic builds are enabled, new pushes to
that branch trigger builds. A commit may also help the repository appear in
Amplify's recently updated repository list. It does not grant GitHub access or
repair an unauthorized installation. If repositories or branches are still
missing, check the GitHub app's organization approval and repository access.

See [GitHub access setup](https://docs.aws.amazon.com/amplify/latest/userguide/setting-up-GitHub-access.html)
and [AWS's repository-list troubleshooting](https://github.com/aws-amplify/amplify-hosting/blob/main/FAQ.md#i-do-not-see-my-repo-in-the-list).

## Environment and backend connections

- Hosting alone does not connect login, photo uploads, or the database. The
  current local/demo session is not production authentication; use test data
  until authenticated APIs and permissions are configured.
- An HTTPS backend API should allow the deployed frontend's exact origin in
  its CORS configuration. Authorized browser-to-S3 uploads also need that
  origin in the photo bucket's CORS rules; keep the bucket private.
- Never put AWS credentials, database passwords, or other secrets in frontend
  environment variables, source files, or `out`. `NEXT_PUBLIC_*` values become
  public browser code. Backend secrets stay on the backend.
- Build logs and output must not contain private `.env` files. Only `out` is
  published by this build configuration.

## Verify locally

With Node.js 22 installed, run from the repository root:

```sh
npm ci --include=dev
npm run build
test -f out/index.html
```

Do not run `next start` to serve this static export. Amplify serves the exported
HTML, CSS, JavaScript, and public assets directly.
