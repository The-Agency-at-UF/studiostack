import {assertRecipientAllowed} from '../email/feedback'
import {alertEmail,deliverAppAlerts} from '../alerts/delivery'
import { AdminGetUserCommand, CognitoIdentityProviderClient, ListUsersCommand } from '@aws-sdk/client-cognito-identity-provider'
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import type { NotificationJob, OutboxRequest } from './outbox'
import { emailPattern, userPoolPattern } from '../../src/types/patterns'
export function decisionEmail(job: NotificationJob, webUrl: string) {
  const url = new URL('/production/',webUrl)
  url.searchParams.set('organization',job.organizationId); url.searchParams.set('brief',job.briefId)
  const p = job.payload, decision = p.decision.replaceAll('_',' ')
  return { subject: `StudioStack: ${decision} — ${p.projectName}`.replace(/[\r\n]/g,' ').slice(0,200), text: [
    'Executive Leadership Team · Production decision', '', `Project: ${p.projectName}`, `Client: ${p.client}`, `Decision: ${decision}`, `Reviewer: ${p.reviewer || 'Production leadership'}`, `Revision: ${p.version}`,
    p.section ? `Section: ${p.section}` : '', p.comment ? `Comments: ${p.comment}` : '', `Target delivery: ${p.deliveryDate || 'Not set'}`, p.shootStartsAt ? `Confirmed shoot: ${p.shootStartsAt} to ${p.shootEndsAt} (end exclusive)` : '', '', `Open brief: ${url.href}`,
  ].filter(Boolean).join('\n') }
}
export interface NotificationDependencies { store(request: OutboxRequest): Promise<{ jobs?: NotificationJob[]; updated?: boolean }>; send(job: NotificationJob): Promise<void> }
type Attributes = { Name?: string; Value?: string }[]
interface RecipientDirectory {
  find(subject: string): Promise<{ Username?: string; Attributes?: Attributes }[]>
  get(username: string): Promise<{ Enabled?: boolean; UserAttributes?: Attributes }>
}
export async function verifiedRecipient(job: Pick<NotificationJob,'recipientSubject'|'recipientIssuer'>, pool: string, directory: RecipientDirectory) {
  const reject = () => Object.assign(new Error('Recipient identity or email is not verified'), { name: 'UnverifiedRecipient' })
  if (job.recipientIssuer !== `https://cognito-idp.us-east-2.amazonaws.com/${pool}` || !/^[a-f0-9-]{36}$/i.test(job.recipientSubject)) throw reject()
  // Classic Cognito usernames are not necessarily their sub. Resolve the stable
  // subject, then read current attributes authoritatively before every send.
  const matches = (await directory.find(job.recipientSubject)).filter(user => user.Attributes?.some(a => a.Name === 'sub' && a.Value === job.recipientSubject))
  if (matches.length !== 1 || !matches[0].Username) throw reject()
  const user = await directory.get(matches[0].Username)
  const attributes = Object.fromEntries((user.UserAttributes ?? []).map(a => [a.Name, a.Value])), email = attributes.email
  if (!user.Enabled || attributes.sub !== job.recipientSubject || attributes.email_verified !== 'true' || !email || !emailPattern.test(email)) throw reject()
  return email
}
export async function deliverNotifications(deps: NotificationDependencies) {
  const { jobs = [] } = await deps.store({ action: 'claim' })
  let sent = 0, failed = 0
  for (const job of jobs) {
    let outcome: 'sent' | 'retry' | 'failed' | 'uncertain' = 'sent'
    try { await deps.send(job); sent++ }
    catch (error) {
      const name = (error as { name?: string }).name
      // Only explicit service rejections are retried. Unknown transport outcomes
      // could have accepted the email and need operator review to avoid duplicates.
      outcome = ['TooManyRequestsException','ThrottlingException','LimitExceededException'].includes(name ?? '') ? 'retry' : ['MessageRejected','MailFromDomainNotVerifiedException','AccountSuspendedException','SendingPausedException','BadRequestException','UnverifiedRecipient','UserNotFoundException'].includes(name ?? '') ? 'failed' : 'uncertain'
      failed++
    }
    const ack = await deps.store({ action: 'ack', organizationId: job.organizationId, id: job.id, leaseToken: job.leaseToken, outcome })
    if (!ack.updated) throw new Error('Delivery acknowledgement failed; inspect the lease before retrying')
  }
  return { claimed: jobs.length, sent, failed }
}
/** Outside-VPC sender invokes a private IAM-only outbox store, then SES. */
export async function handler() {
  const env = process.env.STUDIOSTACK_ENV, storeName = process.env.PRODUCTION_OUTBOX_FUNCTION, sender = process.env.PRODUCTION_EMAIL_FROM, webUrl = process.env.PRODUCTION_WEB_URL
  if (!['dev','prod'].includes(env ?? '') || storeName !== `studiostack-${env}-database` || !sender || !emailPattern.test(sender) || !webUrl || new URL(webUrl).protocol !== 'https:') throw new Error('Notification configuration is incomplete')
  const pool = process.env.COGNITO_USER_POOL_ID
  if (!pool || !userPoolPattern.test(pool)) throw new Error('Recipient directory is not configured')
  const cognito = new CognitoIdentityProviderClient({ region:'us-east-2', maxAttempts:1 })
  const lambda = new LambdaClient({ region: 'us-east-2', maxAttempts: 1 }), ses = new SESv2Client({ region: 'us-east-2', maxAttempts: 1 })
  const recipientAllowed=(email:string)=>assertRecipientAllowed(email,async request=>{const result=await lambda.send(new InvokeCommand({FunctionName:storeName,InvocationType:'RequestResponse',Payload:Buffer.from(JSON.stringify({task:'email-feedback',...request}))}));if(result.FunctionError||!result.Payload)throw new Error('Recipient suppression lookup failed');const value=JSON.parse(Buffer.from(result.Payload).toString());if(typeof value.allowed!=='boolean')throw new Error('Recipient suppression unavailable');return value})
  try {
    // Warming is read-only and may safely repeat while an idle dev Aurora writer
    // resumes. Never automatically replay an ambiguous claim or email send.
    let ready = false
    for (let attempt=0;attempt<2;attempt++) {
      const probe = await lambda.send(new InvokeCommand({FunctionName:storeName,InvocationType:'RequestResponse',Payload:Buffer.from('{}')}))
      const value = probe.Payload ? JSON.parse(Buffer.from(probe.Payload).toString('utf8')) : null
      if (!probe.FunctionError && value?.ok === true) {ready=true;break}
      if (attempt===0) await new Promise(resolve=>setTimeout(resolve,15000))
    }
    if (!ready) throw new Error('Development database did not become ready for notification processing')
    const result = await deliverNotifications({
    async store(request) { const response = await lambda.send(new InvokeCommand({ FunctionName: storeName, InvocationType: 'RequestResponse', Payload: Buffer.from(JSON.stringify({ task: 'production-outbox', ...request })) })); if (response.FunctionError || !response.Payload) throw new Error('Outbox operation failed'); const value = JSON.parse(Buffer.from(response.Payload).toString('utf8')); if (request.action === 'claim' ? !Array.isArray(value.jobs) : typeof value.updated !== 'boolean') throw new Error('Invalid outbox response'); return value },
    async send(job) {
      const recipient = await verifiedRecipient(job,pool,{
        async find(subject) { return (await cognito.send(new ListUsersCommand({UserPoolId:pool,Filter:`sub = "${subject}"`,Limit:2}))).Users ?? [] },
        get(username) { return cognito.send(new AdminGetUserCommand({UserPoolId:pool,Username:username})) },
      })
      const email = decisionEmail(job,webUrl);await recipientAllowed(recipient);await ses.send(new SendEmailCommand({...(process.env.SES_CONFIGURATION_SET?{ConfigurationSetName:process.env.SES_CONFIGURATION_SET}:{}), FromEmailAddress: sender, Destination: { ToAddresses: [recipient] }, Content: { Simple: { Subject: { Data: email.subject, Charset: 'UTF-8' }, Body: { Text: { Data: email.text, Charset: 'UTF-8' } } } }, EmailTags: [{ Name: 'StudioStackDelivery', Value: job.id }] })); await new Promise(resolve=>setTimeout(resolve,1100)) },
  })
    const alerts=await deliverAppAlerts({
      async store(request){const response=await lambda.send(new InvokeCommand({FunctionName:storeName,InvocationType:'RequestResponse',Payload:Buffer.from(JSON.stringify({task:'app-alert-outbox',...request}))}));if(response.FunctionError||!response.Payload)throw new Error('Alert outbox unavailable');const value=JSON.parse(Buffer.from(response.Payload).toString('utf8'));if(request.action==='claim'?!Array.isArray(value.jobs):request.action==='authorize'?typeof value.allowed!=='boolean':typeof value.updated!=='boolean')throw new Error('Invalid alert outbox response');return value},
      async send(job){const recipient=await verifiedRecipient(job,pool,{async find(subject){return (await cognito.send(new ListUsersCommand({UserPoolId:pool,Filter:`sub = "${subject}"`,Limit:2}))).Users??[]},get(username){return cognito.send(new AdminGetUserCommand({UserPoolId:pool,Username:username}))}}),email=alertEmail(job,webUrl);await recipientAllowed(recipient);await ses.send(new SendEmailCommand({...(process.env.SES_CONFIGURATION_SET?{ConfigurationSetName:process.env.SES_CONFIGURATION_SET}:{}),FromEmailAddress:sender,Destination:{ToAddresses:[recipient]},Content:{Simple:{Subject:{Data:email.subject,Charset:'UTF-8'},Body:{Text:{Data:email.text,Charset:'UTF-8'}}}},EmailTags:[{Name:'StudioStackDelivery',Value:job.id}]}));await new Promise(resolve=>setTimeout(resolve,1100))},
    })
    console.log(JSON.stringify({service:'app-alerts',...alerts}));console.log(JSON.stringify({service:'production-notifications',...result}));return {...result,alerts} } finally { lambda.destroy(); ses.destroy(); cognito.destroy() }
}
