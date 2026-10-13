# Private database Lambda deployment

## Current status

Deployed and verified on **October 12, 2026**, in account `423563856930`, region `us-east-2`. Both functions passed live verified-TLS queries against their matching database using restricted application logins. CloudFormation stack `studiostack-database-connections` manages the endpoint, application secrets, runtime roles, HTTPS rules and log groups. The deployment script manages the function packages and temporary login setup.

This guide records the **October 12 connection-only foundation**. On October 13, the approved development API rollout (documented in the forthcoming dev rollout PR) added schema, Cognito, 13 database and 3 private-photo routes to the dev function. Production remains connection-only. Do not redeploy the older connection package over the dev API; `db:deploy` now refuses that downgrade.

The original deployment described below was an IAM-invoked, read-only connectivity check, not an application API or schema migration. Its historical verification is separate from the current dev API/restore evidence.

## Deployed resources

| Resource | Configuration |
| --- | --- |
| `studiostack-dev-database` | Node.js 24, ARM64, 256 MiB, 90-second timeout, no provisioned concurrency, dev runtime secret and dev database Lambda group. |
| `studiostack-prod-database` | Same code, production runtime secret and production database Lambda group. |
| `studiostack-secretsmanager-vpce` | One shared Secrets Manager interface endpoint, IPv4/private DNS, two availability zones. |
| `studiostack-secretsmanager-vpce-sg` | HTTPS 443 inbound only from the two database Lambda groups; no database access. |
| Dev/prod application secrets | Separate restricted PostgreSQL logins; no master credential in normal runtime. |

VPC: `vpc-0c566c49de9c91bda`. Both functions and the endpoint use:

- `subnet-0bb1005a604230bdc` in `us-east-2a`.
- `subnet-0f6ccb58e6d1cfb26` in `us-east-2c`.

These are existing default-VPC subnets. Lambda ENIs do not receive public IPs; an internet-gateway route alone does not give VPC-attached Lambda outbound internet access. The Secrets Manager interface endpoint provides the needed private path without a NAT gateway.

Existing approved database network rules:

| Environment | Database security group | Lambda security group |
| --- | --- | --- |
| Dev | `sg-00b357564909ca20b` | `sg-06b804b6a003b95e0` |
| Prod | `sg-062d80daa895fb7b6` | `sg-0852d29f6cdd33552` |

Each database accepts PostgreSQL 5432 only from its matching Lambda group. Each Lambda group has no inbound rules, PostgreSQL 5432 egress only to its matching database, and HTTPS 443 egress only to endpoint group `sg-0d2dc81507f3b3b0f`. The endpoint is `vpce-03fb814d815091571`, Available with private DNS enabled. Existing database-group outbound rules were not changed. S3 photo-upload Lambdas remain outside this change.

## Credentials and permissions

The approved setup created:

1. Runtime roles `studiostack-dev-database-role` and `studiostack-prod-database-role` have required VPC ENI operations, function-scoped logging, and `GetSecretValue` only on their respective application secret, restricted to requests through this VPC. Function-code ENI write operations are explicitly denied.
2. Application secrets `studiostack/dev/database-app` and `studiostack/prod/database-app` contain AWS-generated passwords. Logins `studiostack_dev_app` and `studiostack_prod_app` have LOGIN and CONNECT to their matching database, a five-connection limit, and no superuser, database/role creation, replication or bypass-RLS privileges. No application table grants or migrations were applied. PostgreSQL PUBLIC privileges remain a separate schema-hardening consideration before application APIs are added.
3. Temporary setup functions and IAM roles were deleted after verification. Runtime roles cannot read master secrets, and the final endpoint policy permits only the two runtime-role/application-secret pairs. Plaintext passwords were never fetched to the workstation or included in responses.
4. Runtime and retained setup log groups use **14-day retention**. Application secrets are retained on stack deletion; credential rotation is not configured yet. Deleting the stack is not a complete teardown of functions or PostgreSQL logins.

## Ongoing costs

The shared endpoint has **two** network interfaces billed even while dev Aurora is paused. At the reviewed indicative $0.01/interface-hour and 730 hours/month, budget about **$14.60/month**, plus data processing. Two application secrets add about **$0.80/month** before API charges. Lambda/logging and existing Aurora charges are separate; these figures are estimates, not a billing guarantee.

No NAT gateway, RDS Proxy, public database access, API integration, schedule or public Lambda URL was added. These functions are private connection diagnostics, not a deployed application backend.

## Build package

Sources: `backend/database/handler.ts` (runtime) and `backend/database/bootstrap.ts` (temporary setup). Bundle dependencies and include the public RDS regional CA certificate in each package. Never include `.env` files, AWS SSO caches, or credential values.

```sh
mkdir -p .aws/database-lambda/certs
mkdir -p .aws/database-setup/certs
curl --fail --location https://truststore.pki.rds.amazonaws.com/us-east-2/us-east-2-bundle.pem -o .aws/database-lambda/certs/us-east-2-bundle.pem
cp .aws/database-lambda/certs/us-east-2-bundle.pem .aws/database-setup/certs/
npx --no-install esbuild backend/database/handler.ts --bundle --platform=node --target=node24 --format=cjs --external:pg-native --outfile=.aws/database-lambda/index.js
npx --no-install esbuild backend/database/bootstrap.ts --bundle --platform=node --target=node24 --format=cjs --external:pg-native --outfile=.aws/database-setup/index.js
```

Each package directory needs `package.json` containing `{"type":"commonjs"}`. From `.aws/database-lambda`, zip `index.js`, `package.json` and `certs/` into `../database-lambda.zip`; repeat from `.aws/database-setup` into `../database-setup.zip`. The Lambda handler is `index.handler`, and `RDS_CA_BUNDLE_PATH` is `/var/task/certs/us-east-2-bundle.pem`. `pg-native` is optional and unused; the pure JavaScript PostgreSQL driver is bundled.

Use explicit `STUDIOSTACK_ENV`, writer hostname, database name, account ID and application-secret ARN per environment. `AWS_REGION` is supplied by Lambda; do not try to set that reserved environment variable. The operator `.env.rds.*.local` files currently reference master secrets and must **not** be uploaded as runtime configuration.

## Deployment and maintenance

`infra/database/resources.ts` defines the tracked infrastructure. `scripts/deploy-database.ts` verifies account, cluster and subnet configuration, creates/updates the managed stack, creates temporary scoped setup roles, deploys both packages and verifies connectivity. It waits for IAM propagation and Lambda VPC readiness. Setup refuses privileged existing logins and does not rotate existing passwords or run schema migrations. Its cleanup removes temporary access and restricts the endpoint policy even after an invocation failure; always inspect the final AWS state if deployment exits unsuccessfully.

Re-running this command temporarily restores master-secret setup access and performs deployment writes. Only run after reviewing the code/packages and approving those changes:

```sh
aws sso login --profile studiostack-dev
npm run db:deploy -- --apply
```

The profile is named `studiostack-dev`, but this script intentionally deploys **both** environments after verifying the account. It is not a dev-only command. Generated templates/packages/results live under gitignored `.aws/`. Normal runtime roles never use the local operator master-secret configs.

Before exposing application APIs, add reviewed migrations/table grants, Cognito authorization, per-organization access enforcement, bounded concurrency, monitoring/alerts, and credential rotation. Deployment did not connect the preview website to persistent database data.

## Verified acceptance checks

- Both functions are attached to the intended VPC/subnets and only their matching database security group.
- Endpoint state is Available, private DNS is enabled, and HTTPS rules are limited to the database Lambda groups.
- Runtime role permissions cannot retrieve the other environment's secret or either master secret.
- A direct IAM-authorized invocation returns `{"ok":true,"environment":"dev"}` or `prod` after a verified-TLS query of the expected database.
- No passwords, database records or raw driver errors appear in the Lambda response/logs.
- Temporary setup access is revoked; no schema migration or CRUD operation is implied by a successful connection check.

References: [AWS PrivateLink pricing](https://aws.amazon.com/privatelink/pricing/), [Secrets Manager pricing](https://aws.amazon.com/secrets-manager/pricing/), [Secrets Manager private endpoints](https://docs.aws.amazon.com/secretsmanager/latest/userguide/vpc-endpoint-overview.html), [TypeScript Lambda packages](https://docs.aws.amazon.com/lambda/latest/dg/typescript-package.html).
