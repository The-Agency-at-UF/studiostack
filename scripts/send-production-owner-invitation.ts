import {readFile,writeFile} from 'node:fs/promises'
import {aws} from './dev-aws'
import {guardProductionApply,productionMetadata,prodDirectory,approvedProductionEmail,type ProductionMetadata} from './prod-aws'
export async function sendProductionOwnerInvitation(metadata:ProductionMetadata){
 const owner=JSON.parse(await readFile(prodDirectory+'/owner.json','utf8')) as {username:string;invitationSent:boolean};if(owner.invitationSent)return
 const user=await aws<{UserStatus:string;UserAttributes:{Name:string;Value:string}[]}>('cognito-idp','admin-get-user',['--user-pool-id',metadata.auth.UserPoolId,'--username',owner.username]),attributes=Object.fromEntries(user.UserAttributes.map(a=>[a.Name,a.Value]));if(attributes.email!==approvedProductionEmail)throw new Error('Approved production owner email mismatch')
 if(user.UserStatus!=='FORCE_CHANGE_PASSWORD')return
 // Email-username pools require the email input here, although AdminGetUser can
 // also use the generated internal username returned during account creation.
 await aws('cognito-idp','admin-create-user',['--user-pool-id',metadata.auth.UserPoolId,'--username',approvedProductionEmail,'--message-action','RESEND','--desired-delivery-mediums','EMAIL']);owner.invitationSent=true;await writeFile(prodDirectory+'/owner.json',JSON.stringify(owner,null,2));console.log('Production invitation sent to the approved UF owner; user chooses the password')
}
async function main(){await guardProductionApply();await sendProductionOwnerInvitation(await productionMetadata())}
if(process.argv[1]?.endsWith('send-production-owner-invitation.ts'))main().catch(error=>{console.error(error instanceof Error?error.message:'Production owner invitation failed');process.exitCode=1})
