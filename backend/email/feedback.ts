import {createHash} from 'node:crypto'
import {InvokeCommand,LambdaClient} from '@aws-sdk/client-lambda'
import type {DatabaseClient} from '../database/client'
import {object,uuid} from '../database/api-validation'
export function emailHash(email:string){return createHash('sha256').update(email.trim().toLowerCase()).digest('hex')}
export type FeedbackRequest={action:'check';emailHash:string}|{action:'record';id:string;kind:'bounce'|'complaint';hashes:string[];deliveryId?:string;invitationId?:string}
function hash(input:unknown){if(typeof input!=='string'||!/^[a-f0-9]{64}$/.test(input))throw new Error('Invalid recipient hash');return input}
export function feedbackRequest(input:unknown):FeedbackRequest{const v=object(input,['action','emailHash','id','kind','hashes','deliveryId','invitationId']);if(v.action==='check'){object(input,['action','emailHash']);return {action:'check',emailHash:hash(v.emailHash)}}if(v.action!=='record'||!['bounce','complaint'].includes(String(v.kind))||!Array.isArray(v.hashes)||v.hashes.length<1||v.hashes.length>50)throw new Error('Invalid delivery feedback');object(input,['action','id','kind','hashes','deliveryId','invitationId']);return {action:'record',id:uuid(v.id),kind:v.kind as 'bounce'|'complaint',hashes:[...new Set(v.hashes.map(hash))].sort(),...(v.deliveryId?{deliveryId:uuid(v.deliveryId)}:{}),...(v.invitationId?{invitationId:uuid(v.invitationId)}:{})}}
export async function feedbackTask(client:DatabaseClient,r:FeedbackRequest){
 if(r.action==='check')return {allowed:!(await client.query('SELECT 1 FROM app.email_suppressions WHERE email_hash=$1',[r.emailHash])).rows.length}
 const receipt=createHash('sha256').update(JSON.stringify(r)).digest('hex');await client.query('BEGIN')
 try{
  for(const job of [r.deliveryId,r.invitationId].filter((id):id is string=>Boolean(id)).sort())await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['mail-feedback:'+job])
  const value=await client.query('INSERT INTO app.email_feedback_events(id,kind,receipt_hash,delivery_id,invitation_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING RETURNING id',[r.id,r.kind,receipt,r.deliveryId??null,r.invitationId??null])
  if(!value.rows.length){const previous=await client.query('SELECT receipt_hash FROM app.email_feedback_events WHERE id=$1',[r.id]);if(previous.rows[0]?.receipt_hash!==receipt)throw new Error('Feedback receipt changed');await client.query('COMMIT');return {recorded:false,suppressed:0}}
  const suppressed=await client.query('INSERT INTO app.email_suppressions(email_hash,reason,event_id) SELECT unnest($1::text[]),$2,$3 ON CONFLICT(email_hash) DO NOTHING RETURNING email_hash',[r.hashes,r.kind,r.id])
  for(const org of (await client.query('SELECT id FROM app.organizations ORDER BY id')).rows){await client.query("SELECT set_config('app.organization_id',$1,true)",[org.id]);await client.query("UPDATE app.user_alerts SET email_status='suppressed',lease_token=NULL,lease_until=NULL WHERE organization_id=$1 AND id=$2 AND email_status<>'sending'",[org.id,r.deliveryId??null]);await client.query("UPDATE app.production_outbox SET status='failed',lease_token=NULL,lease_until=NULL WHERE organization_id=$1 AND id=$2 AND status<>'sending'",[org.id,r.deliveryId??null]);await client.query("UPDATE app.organization_invitations SET delivery_status='failed',lease_token=NULL,lease_until=NULL WHERE organization_id=$1 AND id=$2 AND delivery_status<>'sending'",[org.id,r.invitationId??null])}
  await client.query('COMMIT');return {recorded:true,suppressed:suppressed.rows.length}
 }catch(e){await client.query('ROLLBACK').catch(()=>undefined);throw e}
}
export async function assertRecipientAllowed(email:string,store:(r:FeedbackRequest)=>Promise<{allowed?:boolean}>){if(!(await store({action:'check',emailHash:emailHash(email)})).allowed)throw Object.assign(new Error('Recipient is suppressed'),{name:'UnverifiedRecipient'})}
/** Converts trusted SNS/SES feedback into minimal hashes and job references. */
export function snsFeedback(input:unknown,topicArn:string):FeedbackRequest[]{
 const event=input as {Records?:{EventSource?:string;Sns?:{TopicArn?:string;MessageId?:string;Message?:string}}[]};if(!Array.isArray(event.Records)||event.Records.length>10)throw new Error('Expected SES SNS feedback')
 return event.Records.flatMap(record=>{if(record.EventSource!=='aws:sns'||record.Sns?.TopicArn!==topicArn||typeof record.Sns.Message!=='string'||Buffer.byteLength(record.Sns.Message)>262144)throw new Error('Unexpected feedback source');let v;try{v=JSON.parse(record.Sns.Message)}catch{throw new Error('Invalid feedback JSON')}const type=v.eventType??v.notificationType;if(type!=='Bounce'&&type!=='Complaint')return [];if(type==='Bounce'&&v.bounce?.bounceType==='Transient')return []
  const recipients=type==='Bounce'?v.bounce?.bouncedRecipients:v.complaint?.complainedRecipients,emails=Array.isArray(recipients)?recipients.map((r:{emailAddress?:unknown})=>r.emailAddress):[];if(!emails.length&&Array.isArray(v.mail?.destination)&&v.mail.destination.length===1)emails.push(v.mail.destination[0]);if(!emails.length||emails.some((e:unknown)=>typeof e!=='string'||e.length>254||!/^\S+@\S+\.\S+$/.test(e)))throw new Error('Invalid feedback recipients')
  const tags=v.mail?.tags??{},deliveryId=tags.StudioStackDelivery?.[0],invitationId=tags.StudioStackInvitation?.[0];return [feedbackRequest({action:'record',id:record.Sns.MessageId,kind:type==='Bounce'?'bounce':'complaint',hashes:emails.map(email=>emailHash(email as string)),...(deliveryId?{deliveryId}:{}),...(invitationId?{invitationId}:{})})]
 })
}
export async function handler(event:unknown){
 const env=process.env.STUDIOSTACK_ENV,topic=process.env.EMAIL_FEEDBACK_TOPIC,backend=process.env.PRODUCTION_OUTBOX_FUNCTION;if(!['dev','prod'].includes(env??'')||backend!==`studiostack-${env}-database`||topic!==`arn:aws:sns:us-east-2:423563856930:studiostack-${env}-email-feedback`)throw new Error('Feedback configuration incomplete')
 const requests=snsFeedback(event,topic),lambda=new LambdaClient({region:'us-east-2',maxAttempts:1});let suppressed=0
 try{for(const request of requests){const response=await lambda.send(new InvokeCommand({FunctionName:backend,InvocationType:'RequestResponse',Payload:Buffer.from(JSON.stringify({task:'email-feedback',...request}))}));if(response.FunctionError||!response.Payload)throw new Error('Feedback storage failed');const result=JSON.parse(Buffer.from(response.Payload).toString());if(typeof result.recorded!=='boolean')throw new Error('Feedback storage unavailable');suppressed+=Number(result.suppressed)||0}console.log(JSON.stringify({service:'email-feedback',events:requests.length,suppressed}));return {events:requests.length,suppressed}}finally{lambda.destroy()}
}
