# Production cutover: Aurora to RDS for PostgreSQL

Production moves from Aurora Serverless v2 (`studiostack-prod-db`) to a single-AZ RDS for PostgreSQL 17 `db.t4g.micro` instance (`studiostack-prod-pg`). Dev stays on auto-pausing Aurora. This roughly cuts the production database bill from $44–60 to about $14 a month.

## Before the window

1. Merge the RDS pull requests, then redeploy the production database runtime from a clean `main` checkout (`npm run db:api:prepare`, then the production API deploy). The runtime must already understand `RDS_AUTH=iam`; if it does not, the cutover's final check fails and the runtime is restored to Aurora.
2. `node --import=tsx scripts/deploy-rds-instance.ts --apply-prod` creates the instance (billed from creation). This writes `.aws/prod-rollout/rds-instance.json`.
3. Pick a low-traffic window. Expect a 10–20 minute write freeze for a small database.
4. Set `DATABASE_API_BUILD` to the folder printed by `db:api:prepare` (the setup archive carries the migrations and copy code).

## The cutover

```sh
node --import=tsx scripts/cutover-prod-to-rds.ts            # dry run, changes nothing
node --import=tsx scripts/cutover-prod-to-rds.ts --apply-prod
```

The script:

1. Takes a manual Aurora snapshot, `studiostack-prod-db-pre-rds-<time>`.
2. Freezes writes: sets the `studiostack-prod-database` reserved concurrency to 0 and disables the invitation, notification and retention schedules that were enabled. API requests fail with a retryable error during the freeze; queued emails are retried afterwards.
3. Deploys the temporary maintenance function, which may read both master secrets, then:
   - `rds-prepare`: creates `studiostack_prod_app` on RDS as a password-less login (`GRANT rds_iam`, connection limit 5), applies every migration, and applies the restricted grants.
   - `rds-copy`: reads Aurora in one repeatable-read snapshot and writes RDS in one transaction (all or nothing), in batches of 500 rows. It refuses a target that already has rows.
   - `rds-verify`: compares per-table row counts and content hashes, plus migration checksums. Only table names and counts leave the function, never row data.
4. Switches the runtime to `RDS_HOST=<instance>`, `RDS_AUTH=iam`, `RDS_IAM_USER=studiostack_prod_app` (removing `RDS_SECRET_ARN`), restores concurrency, and checks the runtime answers. Then it records `cutoverAt`, so later deploys keep production on RDS and maintenance uses the RDS master secret.
5. Always unfreezes, re-enabling the schedules it disabled, and writes `.aws/prod-rollout/rds-cutover.json`.

If anything fails before the switch, the runtime stays on Aurora, unchanged. If the post-switch check fails, the previous Aurora configuration is restored. Aurora is never modified.

## After

- Run `node --import=tsx scripts/configure-operational-readiness.ts --apply-prod` to add the RDS connection, CPU-credit and free-storage alarms while keeping the Aurora alarm.
- Watch API 5xx, Lambda errors, connections and CPU credits for 24 hours.
- **Rollback (first 7 days):** set the runtime environment back to the Aurora values in `rds-cutover.json`'s run (or redeploy after removing `cutoverAt` from `rds-instance.json`). Writes made on RDS since the cutover would need to be re-applied by hand.
- After 7 days, stop `studiostack-prod-db`, keep its snapshot, and delete the cluster only after review. Removing the Secrets Manager endpoint and the app secret is a separate change.
