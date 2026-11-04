import {createHash} from 'node:crypto'
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises'
import {dirname,resolve} from 'node:path'
import {execute} from './dev-aws'

/** Each db:api:prepare run writes its own folder, so a build made by another
 * checkout or session can never replace the archive a deploy is about to upload. */
export const buildsDirectory=resolve('.aws/database-api/builds')
export const archives=['runtime.zip','setup.zip'] as const
export interface SourceState {commit:string;clean:boolean}
export interface BuildManifest extends SourceState {createdAt:string;files:Record<typeof archives[number],string>}
export async function sourceState():Promise<SourceState>{
 const commit=(await execute('git',['rev-parse','HEAD'])).stdout.trim(),status=(await execute('git',['status','--porcelain'])).stdout.trim()
 return {commit,clean:!status}
}
const sha256=async(path:string)=>createHash('sha256').update(await readFile(path)).digest('hex')
export async function createBuildDirectory(source:SourceState,root=buildsDirectory){await mkdir(root,{recursive:true});return mkdtemp(`${root}/${source.commit.slice(0,12)}-`)}
export async function writeBuildManifest(directory:string,source:SourceState,now=new Date()){
 const files=Object.fromEntries(await Promise.all(archives.map(async name=>[name,await sha256(`${directory}/${name}`)]))) as BuildManifest['files']
 const manifest:BuildManifest={...source,createdAt:now.toISOString(),files};await writeFile(`${directory}/manifest.json`,JSON.stringify(manifest,null,2));return manifest
}
/** Resolves DATABASE_API_BUILD to archives built from this exact commit and unchanged since; production also needs a clean checkout. */
export async function selectedBuild(environment:'dev'|'prod',{value=process.env.DATABASE_API_BUILD,root=buildsDirectory,source}:{value?:string;root?:string;source?:SourceState}={}){
 if(!value)throw new Error('Set DATABASE_API_BUILD to the build folder printed by db:api:prepare')
 const directory=resolve(value);if(dirname(directory)!==resolve(root))throw new Error('DATABASE_API_BUILD must be a folder created by db:api:prepare')
 const manifest=JSON.parse(await readFile(`${directory}/manifest.json`,'utf8')) as BuildManifest,current=source??await sourceState()
 if(manifest.commit!==current.commit)throw new Error('Database build was made from a different commit; rebuild from this checkout')
 if(environment==='prod'&&(!manifest.clean||!current.clean))throw new Error('Production deploys need a build made from a clean checkout')
 for(const name of archives)if(await sha256(`${directory}/${name}`)!==manifest.files[name])throw new Error(`Database build ${name} changed after it was prepared`)
 return {directory,runtime:`${directory}/runtime.zip`,setup:`${directory}/setup.zip`}
}
