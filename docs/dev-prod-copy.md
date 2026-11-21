# Copy production into dev

`scripts/copy-prod-to-dev.ts` refreshes the development database from production. Localhost uses the dev Cognito pool, API and database. Treat the copy as production data. Email masking covers supported address patterns in database fields. Names, other personal information and copied files can still contain production data.

## What it does

1. Restores production's latest restorable point to a temporary `studiostack-prod-pg-devcopy-<timestamp>` instance. It is private, encrypted and placed in **dev's** database security group. The live production instance is never connected to, and nothing in production changes.
2. A temporary dev maintenance Lambda replaces dev's whole `app` schema in **one transaction**:
   - drops it and re-applies exactly the migrations production has applied, then records production's migration history,
   - copies every row from the restore in one consistent read and checks the row counts,
   - rewrites supported email patterns in text and JSON columns to `u-<hash>@example.invalid`. The same address always becomes the same alias. Addresses in `DEV_COPY_KEEP_EMAILS` (default is the approved production owner) stay as they are,
   - moves every account to the dev Cognito issuer. Each kept email is linked to its enabled, verified dev sign-in,
   - stops every unsent email (brief notifications, invitations, alerts, bug reports).

   A failure within the database transaction rolls back the schema and data changes. File sync runs after the commit and can fail independently.
3. Deletes the temporary instance and its automated backups. The RDS-managed secret goes with it.
4. Mirrors `photos/` and `briefs/` from `studio-stack-photos-prod` into `studio-stack-photos-dev`. Dev objects under those prefixes that production doesn't have are removed.

The script writes run metadata and database counts to `.aws/dev-rollout/prod-copy.json`.

## Run it

```sh
aws sso login --profile studiostack-dev
npm run db:api:prepare        # prints the build folder
DATABASE_API_BUILD=<folder> npm run db:copy:prod-to-dev              # dry run
DATABASE_API_BUILD=<folder> npm run db:copy:prod-to-dev -- --apply-dev
```

Set `DEV_COPY_KEEP_EMAILS=a@example.org,b@example.org` to override the default. Each address must have exactly one enabled, verified dev Cognito sign-in. The restore usually takes 10–20 minutes.

The build has to contain every migration production has applied. If production has one this checkout lacks, the copy stops before touching dev. In that case, build from production's commit. If the dev API runtime is from a newer commit than production, redeploy it from production's commit so the code matches the schema.
