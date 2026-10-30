import {aws} from './dev-aws'
/** Preserve configured feedback when re-running an application/worker deployment. */
export async function emailConfigurationSet(environment:'dev'|'prod'){
 const name=`studiostack-${environment}-delivery`
 try{const result=await aws<{ConfigurationSetName:string}>('sesv2','get-configuration-set',['--configuration-set-name',name]);if(result.ConfigurationSetName!==name)throw new Error('Unexpected mail configuration');return name}catch(error){if((error as {code?:string}).code==='NotFoundException')return undefined;throw error}
}
