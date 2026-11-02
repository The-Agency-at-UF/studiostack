import {aws,applyStack} from './dev-aws'
import {guardProductionApply,saveProductionMetadata} from './prod-aws'
import {productionAuthInfrastructure} from '../infra/production/auth'
async function main(){
 await guardProductionApply()
 const {apps}=await aws<{apps:{appId:string;name:string;defaultDomain:string}[]}>('amplify','list-apps'),matches=apps.filter(a=>a.name==='studiostack-production')
 if(matches.length>1)throw new Error('Multiple production hosting apps; choose explicitly')
 const app=matches[0]??(await aws<{app:typeof matches[number]}>('amplify','create-app',['--name','studiostack-production','--platform','WEB','--tags','ManagedBy=StudioStack,Environment=prod'])).app
 const details=await aws<{app:{tags?:Record<string,string>}}>('amplify','get-app',['--app-id',app.appId]);if(details.app.tags?.ManagedBy!=='StudioStack'||details.app.tags?.Environment!=='prod')throw new Error('Unowned production hosting app')
 const {branches}=await aws<{branches:{branchName:string}[]}>('amplify','list-branches',['--app-id',app.appId]),branch='main'
 if(!branches.some(b=>b.branchName===branch))await aws('amplify','create-branch',['--app-id',app.appId,'--branch-name',branch,'--stage','PRODUCTION','--no-enable-auto-build'])
 const origin=`https://${branch}.${app.defaultDomain}`,auth=await applyStack('studiostack-prod-auth',productionAuthInfrastructure(origin))
 await saveProductionMetadata({app:{appId:app.appId,branch,origin},auth,apiId:'ixzikwz8n5'})
 console.log(`Production hosting and separate authentication prepared: ${origin}`)
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Production foundation failed');process.exitCode=1})
