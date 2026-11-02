# Aurora PostgreSQL: development and production

## Implemented versus pending

The repository now has a shared backend-only TypeScript connection layer, separate dev/prod configuration, a read-only connection check, and guarded schema migrations. The AWS console showed Aurora PostgreSQL **17.9** for both `studiostack-dev-db` and `studiostack-prod-db` in **us-east-2**. Their initial database names are `studiostackdev` and `studiostackprod`.

On October 12, 2026, the separate [database Lambda deployment](database-lambda-deployment.md) created runtime roles, restricted application credentials and private Secrets Manager connectivity, and deployed dev/prod connection-check functions. Both passed live verified-TLS queries. No schema migration was applied. The website still uses its existing preview session/data; Cognito login and inventory/reservation persistence remain separate integration work.

On October 13, the approved [dev rollout](dev-rollout.md) applied migrations 001–003 and restricted dev grants, deployed 13 database plus 3 private-photo routes, and passed 43 live authenticated API/photo checks. Production remains at the original connection-check stage with application migrations pending. The preview website is unchanged; the restore drill has separate evidence/status in the rollout guide.

## Code map

| File | Purpose |
| --- | --- |
| `backend/database/config.ts` | Explicit environment selection and validation of writer endpoint, database, region and account. |
| `backend/database/client.ts` | Secrets Manager credentials, verified TLS, parameterized queries and transactions. |
| `backend/database/handler.ts` | Deployed, IAM-invoked read-only connection diagnostic. |
| `backend/database/bootstrap.ts` | Temporary, fixed-purpose restricted-login setup; not normal runtime. |
| `infra/database/resources.ts` | CloudFormation definitions for private connectivity, roles, app secrets and logs. |
| `scripts/deploy-database.ts` | Approved dev/prod deployment, verification and temporary-access cleanup. |
| `backend/database/migrations/001_identity_and_groups.sql` | Users, organizations, memberships and organization-local user groups. |
| `backend/database/migrations.ts` | Transactional, checksummed migration runner with a concurrency lock. |
| `scripts/check-database.ts` | Read-only check of database name and TLS. |
| `scripts/migrate-database.ts` | Dry run by default; writes only with explicit flags. |

`STUDIOSTACK_ENV`, not `NODE_ENV`, selects the database environment. Next.js can run a production build against a development API without changing the database selection. Never import these modules into browser components, expose database configuration through `NEXT_PUBLIC_*`, or expose a generic SQL endpoint.

## Local configuration

1. Copy `.env.rds.dev.example` to `.env.rds.dev.local` and `.env.rds.prod.example` to `.env.rds.prod.local` if those local files do not exist. Replace placeholders using the corresponding cluster's **Configuration** and **Connectivity & security** tabs.
2. Set `RDS_SECRET_ARN` to the credential secret for the intended environment. No password or access key belongs in the env files. The AWS SDK uses your existing local AWS profile/SSO credentials, or the Lambda execution role after deployment.
3. Obtain the public regional certificate bundle from AWS:

   ```sh
   mkdir -p .aws
   curl --fail --location https://truststore.pki.rds.amazonaws.com/us-east-2/us-east-2-bundle.pem -o .aws/us-east-2-bundle.pem
   ```

4. Authenticate your local AWS profile if needed. The npm commands load `.env.local` followed by the environment-specific RDS file. Existing shell variables take precedence over env files; confirm `STUDIOSTACK_ENV` before an operator command. Use a separate production profile when appropriate.

Actual local config files and certificate bundles are gitignored; example files contain placeholders only. The local operator configs prepared during setup reference the existing RDS-managed **master** secrets. Those are only appropriate for maintenance; normal `database.query()` access deliberately rejects the `postgres` and `rdsadmin` usernames. Username checks cannot detect a differently named privileged account, so restricted database grants remain essential.

## Application credentials and private connectivity

Before deploying a database-backed API:

- Restricted application logins and Secrets Manager secrets exist separately for dev/prod, with JSON fields `username` and `password`. Dev now has narrowly scoped application table/column grants; production still has CONNECT only. Normal requests have no superuser, role-management or schema-creation permissions.
- Set the Lambda's `RDS_SECRET_ARN` to its **application** secret, not the cluster master secret. Its IAM role should allow `secretsmanager:GetSecretValue` only on that environment's exact secret ARN. Grant `kms:Decrypt` only if required by the secret's customer-managed encryption key. An ARN matching the account/region does not prove it belongs to dev or prod; enforce that separation with IAM and reviewed deployment configuration.
- Place database Lambda functions in the database VPC/subnets and permit PostgreSQL port **5432** inbound on the database security group **from the Lambda security group only**. Keep the databases private; local scripts need a VPN or other approved private network path. Do not make a database public to run a local test.
- Provide access to Secrets Manager from private subnets, typically through a Secrets Manager VPC endpoint or an existing appropriately configured outbound route. Either may have ongoing costs; do not create a NAT gateway solely for a quick test without reviewing cost.
- Include the public RDS certificate bundle in the backend deployment package and set `RDS_CA_BUNDLE_PATH` to its deployed path. TLS checks the certificate and hostname; do not disable verification.
- Set a small Lambda concurrency limit initially and monitor DB connections. This implementation opens one connection per operation and closes it before returning. Production pooling/proxy options can be considered when traffic warrants them; this change does not add a proxy.

The frontend and S3-only upload Lambda do not need database credentials. RDS and S3 remain managed services, not services hosted inside Lambda or EC2.

## Safe checks and migrations

```sh
npm run typecheck
npm run test:database
npm run db:migrate:dev    # Lists local migrations; no AWS/DB connection
npm run db:migrate:prod   # Same dry run for production
```

Once credentials, certificate, private connectivity and database availability are verified:

```sh
npm run db:check:dev      # Read-only, operator credentials permitted
npm run db:check:prod     # Read-only, operator credentials permitted
```

**The following commands change database schema.** Review the SQL, verify the target and back up production before applying. Use a controlled maintenance credential/profile; do not grant the application role master-secret access.

```sh
npm run db:migrate:dev -- --apply
npm run db:migrate:prod -- --apply --allow-production
```

Applied migrations are tracked in `app.schema_migrations` with SHA-256 checksums. Do not edit already-applied migrations; add a new numbered file. The runner uses one connection and transaction with an advisory lock. Failures roll back instead of silently replaying writes.

## Users, organizations and groups

The initial schema stores Cognito **issuer + subject** as a unique identity, not passwords. Users can have memberships in multiple organizations, each with its own role/status and groups. Composite foreign keys prevent a group membership from referring to a different organization's group or membership.

Cognito platform groups and organization-local groups are different concepts. The dev HTTP API requires verified Cognito access-token context and authorizes the organization from trusted membership records. Browser-supplied IDs, demo admin flags and foreign keys alone are not authorization. Identity tables are not protected by RLS; migrations 002/003 add RLS to inventory, reservations, groups and photos as defense in depth. Invitations, role editing, onboarding and one database per institution remain future work. These two databases separate **development and production**, not institutions. The schema/routes are deployed only in dev.

## Serverless capacity and backups

The creation plan used dev **0–1 ACU with a five-minute idle auto-pause**, and prod **0.5–2 ACUs**, keeping production awake. Verify the actual writer instance capacity settings in AWS before relying on them; the cluster-level engine mode alone does not identify Serverless v2 capacity.

Open connections can prevent auto-pause. Clients close connections promptly. Maintenance/connectivity checks allow 45 seconds for resume; the deployed dev API uses 18-second connection and 28-second Lambda timeouts to fit its 29-second integration. An idle resume can still exceed that budget: warm safely or retry deliberately with the same reservation request ID, never replay ambiguous writes automatically. Storage/backups still cost money while compute is paused.

Enable and verify automated backup retention and restoration separately. Migration history in Git is **not** a database backup. Take a snapshot before a risky production migration and test restoration into a separate cluster. The connection deployment did not change Aurora backup policies or capacity settings.

## AWS references

- [Connecting Lambda to RDS](https://docs.aws.amazon.com/lambda/latest/dg/services-rds.html)
- [Aurora-managed Secrets Manager credentials](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/rds-secrets-manager.html)
- [Aurora Serverless v2 auto-pause](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2-auto-pause.html)
- [node-postgres verified TLS configuration](https://node-postgres.com/features/ssl)
