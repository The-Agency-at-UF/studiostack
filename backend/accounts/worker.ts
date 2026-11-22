import {reconcileDeletion,deletionTask,type DeletionRequest} from './deletion'
import {assertRecipientAllowed} from '../email/feedback'
import {deliverLeased,prepareDelivery} from '../email/delivery'
import {AdminCreateUserCommand,AdminDeleteUserCommand,AdminGetUserCommand,CognitoIdentityProviderClient,DeleteUserCommand,GetUserCommand,ListUsersCommand} from '@aws-sdk/client-cognito-identity-provider'
import {InvokeCommand,LambdaClient} from '@aws-sdk/client-lambda'
import {SendEmailCommand,SESv2Client} from '@aws-sdk/client-sesv2'
import type {APIGatewayProxyEventV2WithJWTAuthorizer} from 'aws-lambda'
import {apiConfiguration,trustedIdentity,type ApiConfiguration} from '../database/api'
import {ApiError,jsonResponse as response,object,text,uuid} from '../database/api-validation'
import {emailInUse,type AccountClaim,type DirectoryRequest} from './directory'
import type {InvitationJob,InvitationQueueRequest} from './queue'
import {directoryRoutes} from './routes'
import {emailPattern,userPoolPattern} from '../../src/types/patterns'
type Attributes={Name?:string;Value?:string}[]
export async function handleDirectory(event:APIGatewayProxyEventV2WithJWTAuthorizer,config:ApiConfiguration,deps:{getUser(token:string):Promise<{UserAttributes?:Attributes;Username?:string}>;store(request:DirectoryRequest):Promise<unknown>;signInState?(subject:string):Promise<'deleted'|'active'>;deleteUser?(token:string):Promise<unknown>;completeDeletion?(request:Extract<DeletionRequest,{action:'complete'}>):Promise<unknown>}) {
  try {
    const identity=trustedIdentity(event,config,Date.now())
    if(!directoryRoutes.includes(event.routeKey)||event.requestContext.http.method!==event.routeKey.split(' ')[0])throw new ApiError(404,'Account operation not found')
    object(event.queryStringParameters??{},[])
    const token=(event.headers.authorization??event.headers.Authorization??'').match(/^Bearer ([^\s]+)$/)?.[1]
    if(!token)throw new ApiError(401,'Sign in again')
    const user=await deps.getUser(token),attrs=Object.fromEntries((user.UserAttributes??[]).map(a=>[a.Name,a.Value]))
    if(event.routeKey==='POST /account/delete') {
      if(attrs.sub!==identity.subject)throw new ApiError(403,'Sign in again')
      if(!deps.deleteUser)throw new ApiError(503,'Account deletion is unavailable')
      let body:unknown;try{body=JSON.parse(event.isBase64Encoded?Buffer.from(event.body??'','base64').toString():event.body??'')}catch{throw new ApiError(400,'Invalid account request')}
      object(body,[])
      // Record a durable deletion operation before calling Cognito.
      const result=await deps.store({action:'delete-account',identity:{...identity,email:''},deletionUsername:user.Username??identity.subject}) as {statusCode?:number;error?:string}
      if(result.statusCode)return response(result.statusCode,{error:result.error})
      if(!('deleted' in result)||result.deleted!==true)throw new Error('Account deletion receipt unavailable')
      try { await deps.deleteUser(token) }
      catch(error) { if(!(error instanceof Error)||error.name!=='UserNotFoundException')throw error }
      // If acknowledgment is unavailable, the recovery sweep verifies provider absence.
      await deps.completeDeletion?.({action:'complete',issuer:identity.issuer,subject:identity.subject})
        .catch(()=>console.log(JSON.stringify({type:'account-deletion-ack-pending'})))
      return response(200,{deleted:true})
    }
    if(attrs.sub!==identity.subject||attrs.email_verified!=='true'||!attrs.email||!emailPattern.test(attrs.email))throw new ApiError(403,'Verify your sign-in email before accepting invitations')
    const input:DirectoryRequest={action:'list',identity:{...identity,email:attrs.email.toLowerCase()}}
    if(event.requestContext.http.method==='POST') {
      if(!event.body||event.body.length>2048)throw new ApiError(400,'An organization ID is required')
      let body:unknown;try{body=JSON.parse(event.isBase64Encoded?Buffer.from(event.body,'base64').toString():event.body)}catch{throw new ApiError(400,'Invalid account request')}
      const route=event.routeKey.split(' ')[1]
      if(route==='/account/invitations/{invitationId}/accept'){const value=object(body,['organizationId']);Object.assign(input,{action:'accept',invitationId:uuid(event.pathParameters?.invitationId),organizationId:uuid(value.organizationId)})}
      else if(route==='/account/onboarding/domain-joins'){const value=object(body,['organizationId']);Object.assign(input,{action:'join-domain',organizationId:uuid(value.organizationId)})}
      else if(route==='/account/onboarding/code-joins'){const value=object(body,['code']);Object.assign(input,{action:'join-code',code:text(value.code,32)})}
      else if(route==='/account/onboarding/searches'){const value=object(body,['query']);Object.assign(input,{action:'search',query:text(value.query,80)})}
      else if(route==='/account/onboarding/access-requests'){const value=object(body,['organizationId','message']);Object.assign(input,{action:'request-access',organizationId:uuid(value.organizationId),...(value.message===undefined||value.message===''?{}:{message:text(value.message,500)})})}
      else {const value=object(body,['organizationId']);Object.assign(input,{action:'withdraw-request',requestId:uuid(event.pathParameters?.requestId),organizationId:uuid(value.organizationId)})}
    } else if(event.routeKey==='GET /account/onboarding')input.action='overview'
    let result=await deps.store(input) as {statusCode?:number;error?:string}&Partial<AccountClaim>
    if(result.accountClaim) {
      // Another account holds this verified email. Ask Cognito whether its sign-in still exists, once.
      if(!deps.signInState)return response(409,{error:emailInUse})
      const subject=result.accountClaim.previousSubject
      result=await deps.store({...input,previousSignIn:{subject,state:await deps.signInState(subject)}}) as typeof result
      if(result.accountClaim)return response(409,{error:emailInUse})
    }
    return result.statusCode?response(result.statusCode,{error:result.error}):response(200,result)
  } catch(error){return error instanceof ApiError?response(error.status,{error:error.message}):response(503,{error:'Account services are temporarily unavailable'})}
}
export async function deliverInvitations(deps:{store(request:InvitationQueueRequest):Promise<{jobs?:InvitationJob[];updated?:boolean}>;prepare(job:InvitationJob):Promise<()=>Promise<void>>}) {
  const {jobs=[]}=await deps.store({action:'claim'})
  const {claimed,sent,failed}=await deliverLeased({jobs,rejected:['MessageRejected','InvalidParameterException','CodeDeliveryFailureException','UnverifiedRecipient'],ackError:'Invitation acknowledgement failed',
    deliver:async job=>{
      const send=await prepareDelivery(()=>deps.prepare(job))
      const lease={organizationId:job.organizationId,id:job.id,leaseToken:job.leaseToken}
      if(!(await prepareDelivery(()=>deps.store({action:'begin',...lease}))).updated)return 'skipped' as const
      await send()
      return 'sent' as const
    },
    ack:(job,outcome)=>deps.store({action:'ack',organizationId:job.organizationId,id:job.id,leaseToken:job.leaseToken,outcome})})
  return {claimed,sent,failed}
}
export async function handler(event:Record<string,unknown>={}) {
  const env=process.env.STUDIOSTACK_ENV,pool=process.env.COGNITO_USER_POOL_ID,storeName=process.env.PRODUCTION_OUTBOX_FUNCTION,from=process.env.PRODUCTION_EMAIL_FROM,web=process.env.PRODUCTION_WEB_URL
  if(!['dev','prod'].includes(env??'')||storeName!==`studiostack-${env}-database`||!pool||!userPoolPattern.test(pool)||!from||!web||new URL(web).protocol!=='https:')throw new Error('Account worker configuration is incomplete')
  const lambda=new LambdaClient({region:'us-east-2',maxAttempts:1}),cognito=new CognitoIdentityProviderClient({region:'us-east-2',maxAttempts:1}),ses=new SESv2Client({region:'us-east-2',maxAttempts:1})
  async function invoke<T>(task:string,body:unknown):Promise<T>{const result=await lambda.send(new InvokeCommand({FunctionName:storeName,InvocationType:'RequestResponse',Payload:Buffer.from(JSON.stringify({task,...body as object}))}));if(result.FunctionError||!result.Payload)throw new Error('Private account operation failed');const value=JSON.parse(Buffer.from(result.Payload).toString());if(task==='account-invitation-queue'&&(!value||value.statusCode))throw new Error('Private invitation queue failed');return value as T}
  try {
    if('requestContext'in event||'version'in event)return await handleDirectory(event as unknown as APIGatewayProxyEventV2WithJWTAuthorizer,apiConfiguration(),{getUser:token=>cognito.send(new GetUserCommand({AccessToken:token})),deleteUser:token=>cognito.send(new DeleteUserCommand({AccessToken:token})),store:input=>invoke('account-directory',input),completeDeletion:async input=>{const result=await invoke<{completed?:boolean}>('account-deletion',input);if(typeof result.completed!=='boolean')throw new Error('Deletion acknowledgment unavailable')},signInState:async subject=>((await cognito.send(new ListUsersCommand({UserPoolId:pool,Filter:`sub = ${JSON.stringify(subject)}`,Limit:1}))).Users??[]).length?'active':'deleted'})
    let ready=false
    for(let attempt=0;attempt<2;attempt++) {
      const probe=await lambda.send(new InvokeCommand({FunctionName:storeName,InvocationType:'RequestResponse',Payload:Buffer.from('{}')})),value=probe.Payload?JSON.parse(Buffer.from(probe.Payload).toString()):null
      if(!probe.FunctionError&&value?.ok===true){ready=true;break}
      if(attempt===0)await new Promise(resolve=>setTimeout(resolve,15000))
    }
    if(!ready)throw new Error('Database was not ready for invitation delivery')
    const deletions=await invoke<Awaited<ReturnType<typeof deletionTask>>>('account-deletion',{action:'claim'})
    if(!('jobs'in deletions)||!Array.isArray(deletions.jobs))throw new Error('Account deletion queue unavailable')
    let completed=0
    for(const job of deletions.jobs){
      try {
        await reconcileDeletion(job,`https://cognito-idp.us-east-2.amazonaws.com/${pool}`,{
          get:async username=>{
            const user=await cognito.send(new AdminGetUserCommand({UserPoolId:pool,Username:username}))
            return {subject:user.UserAttributes?.find(attribute=>attribute.Name==='sub')?.Value}
          },
          remove:async subject=>{await cognito.send(new AdminDeleteUserCommand({UserPoolId:pool,Username:subject}))},
        })
        const result=await invoke<{completed?:boolean}>('account-deletion',{action:'complete',issuer:job.issuer,subject:job.subject})
        if(result.completed!==true)throw new Error('Deletion acknowledgment unavailable')
        completed++
      } catch {
        // Log counts only. Claimed operations become eligible again after their retry delay.
      }
    }
    console.log(JSON.stringify({service:'account-deletion',completed,pending:deletions.jobs.length-completed}))
    const result=await deliverInvitations({store:input=>invoke('account-invitation-queue',input),prepare:async job=>{
      await assertRecipientAllowed(job.email,async request=>{
        const value=await invoke<{allowed?:boolean}>('email-feedback',request)
        if(typeof value.allowed!=='boolean')throw new Error('Invitation suppression lookup unavailable')
        return value
      })
      const users=(await cognito.send(new ListUsersCommand({UserPoolId:pool,Filter:`email = ${JSON.stringify(job.email)}`,Limit:2}))).Users??[]
      if(users.length>1)throw Object.assign(new Error('Ambiguous recipient'),{name:'UnverifiedRecipient'})
      if(!users.length)return async()=>{await cognito.send(new AdminCreateUserCommand({UserPoolId:pool,Username:job.email,DesiredDeliveryMediums:['EMAIL'],UserAttributes:[{Name:'email',Value:job.email},{Name:'name',Value:job.displayName}]}))}
      const user=await cognito.send(new AdminGetUserCommand({UserPoolId:pool,Username:users[0].Username!})),attrs=Object.fromEntries((user.UserAttributes??[]).map(a=>[a.Name,a.Value]))
      if(!user.Enabled||attrs.email?.toLowerCase()!==job.email)throw Object.assign(new Error('Recipient unavailable'),{name:'UnverifiedRecipient'})
      if(user.UserStatus==='FORCE_CHANGE_PASSWORD')return async()=>{await cognito.send(new AdminCreateUserCommand({UserPoolId:pool,Username:user.Username!,MessageAction:'RESEND',DesiredDeliveryMediums:['EMAIL']}))}
      return async()=>{await ses.send(new SendEmailCommand({FromEmailAddress:from,Destination:{ToAddresses:[job.email]},...(process.env.SES_CONFIGURATION_SET?{ConfigurationSetName:process.env.SES_CONFIGURATION_SET}:{}),Content:{Simple:{Subject:{Data:`StudioStack invitation: ${job.organizationName}`.replace(/[\r\n]/g,' ').slice(0,200)},Body:{Text:{Data:`You were invited to ${job.organizationName} as ${job.role}.\n\nSign in at ${new URL('/login/',web).href}, verify your sign-in email and accept the invitation in your account. The invitation expires after seven days. If you did not expect it, you can ignore it.`}}}},EmailTags:[{Name:'StudioStackInvitation',Value:job.id},{Name:'StudioStackAttempt',Value:job.leaseToken}]}));await new Promise(resolve=>setTimeout(resolve,1100))}
    }})
    console.log(JSON.stringify({service:'account-invitations',...result}));return result
  } finally {lambda.destroy();cognito.destroy();ses.destroy()}
}
