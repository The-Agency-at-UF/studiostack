import {readFile,readdir} from 'node:fs/promises'
import {join,relative,resolve} from 'node:path'

/** A deployment is usable only if its HTML, Flight responses and referenced
 * assets are from the same build. A 200 HTML fallback is not valid route data.
 */
export async function verifyStaticRoutes(origin:string,directory='out',send:typeof fetch=fetch) {
  const root=resolve(directory),files=new Map<string,string>()
  let routes=0
  async function visit(current:string) {
    for(const entry of await readdir(current,{withFileTypes:true})) {
      const path=join(current,entry.name)
      if(entry.isDirectory())await visit(path)
      else if(entry.name==='index.txt') {
        const route=relative(root,current).split('\\').join('/')
        const htmlPath=join(current,'index.html'),html=await readFile(htmlPath,'utf8')
        files.set('/'+(route?route+'/':''),htmlPath)
        files.set('/'+(route?route+'/':'')+'index.txt',path)
        if(route)files.set('/'+route+'.txt',path)
        for(const match of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?]+)(?:\?[^"]*)?"/g)) {
          files.set(match[1],join(root,match[1]))
        }
        routes++
      }
    }
  }
  await visit(root)
  if(!routes)throw new Error('No exported routes to verify')
  const entries=[...files]
  for(let start=0;start<entries.length;start+=4) {
    await Promise.all(entries.slice(start,start+4).map(async([url,file])=>{
      const response=await send(new URL(url,origin),{signal:AbortSignal.timeout(15_000),cache:'no-store'})
      if(!response.ok)throw new Error(`Static deployment failed: ${url} (${response.status})`)
      const remote=Buffer.from(await response.arrayBuffer()),local=await readFile(file)
      if(!remote.equals(local))throw new Error(`Static deployment has mismatched build data: ${url}`)
      if(url.endsWith('.txt')&&response.headers.get('content-type')?.includes('text/html'))throw new Error(`Static route data received HTML: ${url}`)
    }))
  }
  return {routes,files:files.size}
}
