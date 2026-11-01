import {emailConfigurationSet} from './email-configuration'
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { productionNotificationInfrastructure } from '../infra/production/notifications'
import { readMetadata } from './deploy-dev-api'
import { aws, applyStack, devDirectory, guardDevApply, execute } from './dev-aws'
async function main() {
  await guardDevApply()
  const metadata = await readMetadata()
  const sender = process.env.PRODUCTION_EMAIL_FROM, identity = process.env.PRODUCTION_EMAIL_IDENTITY
  const web = JSON.parse(await readFile(`${devDirectory}/web-deployment.json`,'utf8')) as {origin:string}
  if (!sender || !identity) throw new Error('Set the approved PRODUCTION_EMAIL_FROM and PRODUCTION_EMAIL_IDENTITY')
  const verified = await aws<{VerifiedForSendingStatus?:boolean}>('sesv2','get-email-identity',['--email-identity',identity])
  if (!verified.VerifiedForSendingStatus) throw new Error('Sender identity is not verified yet')
  const directory = resolve('.aws/production-notifications');await mkdir(directory,{recursive:true})
  await execute(resolve('node_modules/.bin/esbuild'),['backend/production/notifications.ts','--bundle','--platform=node','--target=node24','--format=cjs',`--outfile=${directory}/index.js`])
  const zip=resolve(`${directory}/sender.zip`);await rm(zip,{force:true});await execute('zip',['-q',zip,'index.js'],{cwd:directory})
  const key=`deployments/production/${Date.now()}/sender.zip`
  await aws('s3api','put-object',['--bucket','studio-stack-photos-dev','--key',key,'--body',zip,'--server-side-encryption','AES256'])
  const stack = productionNotificationInfrastructure({environment:'dev',configurationSet:await emailConfigurationSet('dev'),artifactBucket:'studio-stack-photos-dev',artifactKey:key,sender,identity,webUrl:web.origin,userPoolId:metadata.auth.UserPoolId,enabled:true})
  await applyStack('studiostack-dev-production-notifications',stack)
  const name='studiostack-dev-database'
  const config = await aws<{Environment:{Variables:Record<string,string>}}>('lambda','get-function-configuration',['--function-name',name])
  await aws('lambda','update-function-configuration',['--function-name',name,'--environment',JSON.stringify({Variables:{...config.Environment.Variables,PRODUCTION_EMAIL_ENABLED:'yes'}})])
  await writeFile(`${devDirectory}/notification-deployment.json`,JSON.stringify({sender,identity,webUrl:web.origin,configuredAt:new Date().toISOString()},null,2))
  console.log('Development decision email delivery configured; no test email was sent to a person')
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Notification setup failed');process.exitCode=1})
