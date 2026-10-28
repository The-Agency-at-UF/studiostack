import { aws, guardDevApply } from './dev-aws'
import { readMetadata, withMaintenance, invokeMaintenance } from './deploy-dev-api'
async function main() {
  await guardDevApply()
  const metadata=await readMetadata(),email='rmckenzie1@ufl.edu'
  const result=await aws<{Users:{Username:string;Attributes:{Name:string;Value:string}[]}[]}>('cognito-idp','list-users',['--user-pool-id',metadata.auth.UserPoolId,'--filter',`email = "${email}"`])
  if(result.Users.length>1) throw new Error('Multiple development accounts match the approved email')
  let user=result.Users[0]
  if(!user) {
    user=(await aws<{User:typeof user}>('cognito-idp','admin-create-user',['--user-pool-id',metadata.auth.UserPoolId,'--username',email,'--user-attributes',`Name=email,Value=${email}`,'Name=name,Value=Roger McKenzie','--desired-delivery-mediums','EMAIL'])).User
    console.log('Development sign-in invitation sent to the approved administrator')
  }
  const attributes=Object.fromEntries(user.Attributes.map(a=>[a.Name,a.Value]))
  if(attributes.email!==email || !attributes.sub) throw new Error('Administrator identity did not match')
  await withMaintenance(metadata,'20261027-00000000',async()=>{
    const result=await invokeMaintenance<{ok:boolean;organizationId:string}>({action:'bootstrap-production-admin',subject:attributes.sub,email})
    if(!result.ok) throw new Error('Administrator setup failed')
    console.log(`Development administrator and organization configured: ${result.organizationId}`)
  })
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Administrator setup failed');process.exitCode=1})
