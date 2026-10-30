import {copyFile,readdir} from 'node:fs/promises'
import {resolve,join,dirname} from 'node:path'

/** Serve both URL forms used by Next's static-export client router.
 * Trailing-slash pages live in route/index.txt; some client navigations request
 * route.txt. An HTML rewrite cannot substitute for a Flight data response.
 */
export async function prepareStaticRoutes(directory:string) {
  const root=resolve(directory)
  let aliases=0
  async function visit(current:string):Promise<void>{
    for(const entry of await readdir(current,{withFileTypes:true})){
      const path=join(current,entry.name)
      if(entry.isDirectory())await visit(path)
      else if(entry.isFile()&&entry.name==='index.txt'&&current!==root){
        await copyFile(path,join(dirname(current),current.slice(dirname(current).length+1)+'.txt'))
        aliases++
      }
    }
  }
  await visit(root)
  return aliases
}
if(process.argv[1]?.endsWith('prepare-static-routes.ts')){
  prepareStaticRoutes('out').then(count=>console.log(`Prepared ${count} static route-data aliases`)).catch(()=>{console.error('Static route preparation failed');process.exitCode=1})
}
