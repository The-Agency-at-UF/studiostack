import { writeFile } from 'node:fs/promises'
import { infrastructure, account } from '../infra/database/resources'
import { devAuthInfrastructure } from '../infra/database/dev-auth'
import { aws, applyStack, guardDevApply, devDirectory } from './dev-aws'

async function main() {
  await guardDevApply()
  const { DBClusters } = await aws<{ DBClusters: { DBClusterIdentifier: string; MasterUserSecret: { SecretArn: string } }[] }>('rds', 'describe-db-clusters')
  const secrets = Object.fromEntries(['dev', 'prod'].map(env => [env, DBClusters.find(c => c.DBClusterIdentifier === `studiostack-${env}-db`)!.MasterUserSecret.SecretArn])) as Record<'dev' | 'prod', string>
  const { PrefixLists } = await aws<{ PrefixLists: { PrefixListId: string }[] }>('ec2', 'describe-prefix-lists', ['--filters', 'Name=prefix-list-name,Values=com.amazonaws.us-east-2.s3'])
  if (PrefixLists.length !== 1) throw new Error('Unexpected S3 prefix list')
  const auth = await applyStack('studiostack-dev-auth', devAuthInfrastructure())
  const network = await applyStack('studiostack-database-connections', infrastructure(secrets, false, { prefixListId: PrefixLists[0].PrefixListId }))
  const metadata = { account, region: 'us-east-2', auth, network, masterSecrets: secrets, prefixListId: PrefixLists[0].PrefixListId }
  await writeFile(`${devDirectory}/metadata.json`, JSON.stringify(metadata, null, 2))
  console.log('Dev user pool/client and private S3 networking ready; production roles unchanged')
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Dev foundation failed'); process.exitCode = 1 })
