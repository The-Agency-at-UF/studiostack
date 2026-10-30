import {randomUUID,createHash} from 'node:crypto'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {aws,devDirectory,guardDevApply} from './dev-aws'
import {guardProductionApply,prodDirectory} from './prod-aws'
async function main(){
 const env=process.argv.slice(2).join(' ')==='--apply-dev'?'dev':process.argv.slice(2).join(' ')==='--apply-prod'?'prod':undefined;if(!env)throw new Error('Explicit environment required');if(env==='dev')await guardDevApply();else await guardProductionApply()
 const bucket=`studio-stack-photos-${env}`,run=randomUUID(),key=`recovery-drills/${run}/restore.txt`,directory=(env==='dev'?devDirectory:prodDirectory)+'/file-recovery-'+run;await mkdir(directory,{recursive:true})
 const versioning=await aws<{Status?:string}>('s3api','get-bucket-versioning',['--bucket',bucket]);if(versioning?.Status!=='Enabled')throw new Error('Enable and verify object versioning before this recovery drill')
 const access=await aws<{PublicAccessBlockConfiguration:Record<string,boolean>}>('s3api','get-public-access-block',['--bucket',bucket]);if(!Object.values(access.PublicAccessBlockConfiguration).every(Boolean))throw new Error('Storage public-access protections differ')
 const first='StudioStack disposable recovery fixture, original version.\n',second='Simulated accidental overwrite.\n',path=directory+'/fixture.txt',restored=directory+'/restored.txt';let created=false,passed=false,cleanupFailed=false
 try{
  await writeFile(path,first);const original=await aws<{VersionId:string}>('s3api','put-object',['--bucket',bucket,'--key',key,'--body',path,'--server-side-encryption','AES256']);created=true;if(!original.VersionId)throw new Error('Original object version missing')
  await writeFile(path,second);await aws('s3api','put-object',['--bucket',bucket,'--key',key,'--body',path,'--server-side-encryption','AES256']);await aws('s3api','delete-object',['--bucket',bucket,'--key',key])
  let hidden=false;try{await aws('s3api','get-object',['--bucket',bucket,'--key',key,restored])}catch(error){if((error as {code?:string}).code!=='NoSuchKey')throw error;hidden=true}if(!hidden)throw new Error('Delete-marker simulation failed')
  await aws('s3api','get-object',['--bucket',bucket,'--key',key,'--version-id',original.VersionId,restored]);if(await readFile(restored,'utf8')!==first)throw new Error('Historical version checksum differs')
  await aws('s3api','copy-object',['--bucket',bucket,'--key',key,'--copy-source',`${bucket}/${key}?versionId=${encodeURIComponent(original.VersionId)}`,'--server-side-encryption','AES256']);await aws('s3api','get-object',['--bucket',bucket,'--key',key,restored]);if(await readFile(restored,'utf8')!==first)throw new Error('Restored current object differs')
  const anonymous=await fetch(`https://${bucket}.s3.us-east-2.amazonaws.com/${key}`,{signal:AbortSignal.timeout(30000)});if(anonymous.status!==403)throw new Error('Recovery fixture is not private')
  passed=true;await writeFile((env==='dev'?devDirectory:prodDirectory)+'/file-recovery.json',JSON.stringify({run,bucket,originalVersionRecovered:true,overwriteAndDeleteRecovered:true,anonymousReadRejected:true,sha256:createHash('sha256').update(first).digest('hex'),cleanupPending:true,verifiedAt:new Date().toISOString()},null,2))
 }finally{
  if(created){const objects=await aws<{Versions?:{Key:string;VersionId:string}[];DeleteMarkers?:{Key:string;VersionId:string}[]}>('s3api','list-object-versions',['--bucket',bucket,'--prefix',key]),versions=[...(objects.Versions??[]),...(objects.DeleteMarkers??[])].filter(v=>v.Key===key).map(v=>({Key:key,VersionId:v.VersionId}));if(versions.length){const result=await aws<{Errors?:unknown[]}>('s3api','delete-objects',['--bucket',bucket,'--delete',JSON.stringify({Objects:versions,Quiet:true})]);if(result?.Errors?.length)cleanupFailed=true}}
  if(passed&&!cleanupFailed){const evidencePath=(env==='dev'?devDirectory:prodDirectory)+'/file-recovery.json',evidence=JSON.parse(await readFile(evidencePath,'utf8'));evidence.cleanupPending=false;await writeFile(evidencePath,JSON.stringify(evidence,null,2))}if(!cleanupFailed)console.log(env+' disposable recovery object versions removed')
 }
 if(cleanupFailed)throw new Error('Disposable recovery version cleanup failed')
 console.log(env+' private-file recovery verified across overwrite and deletion')
}
main().catch(error=>{console.error(error instanceof Error?error.message:'File recovery drill failed');process.exitCode=1})
