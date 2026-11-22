# Production cutover: Aurora to RDS for PostgreSQL

The recorded production cutover moved StudioStack from Aurora Serverless v2 (`studiostack-prod-db`) to the single-AZ RDS for PostgreSQL 17 `db.t4g.micro` instance `studiostack-prod-pg` on November 13, 2026. Development uses its own Aurora cluster. The procedure below documents a future authorized cutover from Aurora.

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
4. Verifies the current deployed ZIP hash and invokes an unrouted probe using the runtime role and VPC to verify the RDS IAM connection.
5. Switches the runtime to `RDS_HOST=<instance>`, `RDS_AUTH=iam`, `RDS_IAM_USER=studiostack_prod_app`, removes `RDS_SECRET_ARN` and verifies the configuration while reserved concurrency is still zero.
6. Writes the comparison and confirmed target to the rollout records before restoring concurrency and reenabling the schedules it paused. Subsequent deploys and maintenance validate the live target against RDS metadata, including when a checkout has no local cutover record.

If verification fails before reopening, the script confirms the Aurora configuration while fenced before reopening on Aurora. An ambiguous reopen response requires checking actual concurrency and schedules and completing recovery on RDS. Coordinate the window with the database, capacity, and deployment operators so they leave the reserved-concurrency fence under the cutover script's control.

## After

- Run `node --import=tsx scripts/configure-operational-readiness.ts --apply-prod` to add the RDS connection, CPU-credit and free-storage alarms while keeping the Aurora alarm.
- Watch API 5xx, Lambda errors, connections and CPU credits for 24 hours.
- A return to Aurora after admitting RDS writes requires an authorized reverse cutover. Drain production, reconcile committed RDS data into the destination, verify the comparison, then switch and reopen under the same write fence.
- After 7 days, stop `studiostack-prod-db`, keep its snapshot, and delete the cluster only after review. Removing the Secrets Manager endpoint and the app secret is a separate change.
