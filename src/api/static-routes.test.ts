// @vitest-environment node
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {expect,it} from 'vitest'
import {prepareStaticRoutes} from '../../scripts/prepare-static-routes'
import {verifyStaticRoutes} from '../../scripts/verify-static-routes'
it('preserves Flight bytes and supplies flat and nested route aliases without replacing HTML',async()=>{
 const root=await mkdtemp(join(tmpdir(),'studiostack-static-'))
 try{
  await mkdir(join(root,'organization/settings'),{recursive:true});await mkdir(join(root,'reports'))
  await writeFile(join(root,'index.txt'),'root-flight')
  await writeFile(join(root,'reports/index.txt'),'0:["reports-flight"]\n')
  await writeFile(join(root,'reports/index.html'),'<h1>Reports</h1>')
  await writeFile(join(root,'organization/settings/index.txt'),'settings-flight')
  expect(await prepareStaticRoutes(root)).toBe(2)
  expect(await readFile(join(root,'reports.txt'),'utf8')).toBe('0:["reports-flight"]\n')
  expect(await readFile(join(root,'organization/settings.txt'),'utf8')).toBe('settings-flight')
  expect(await readFile(join(root,'reports/index.html'),'utf8')).toBe('<h1>Reports</h1>')
  expect(await prepareStaticRoutes(root)).toBe(2)
 }finally{await rm(root,{recursive:true,force:true})}
})

it('rejects a deployment that serves HTML or a stale build in place of route data',async()=>{
 const root=await mkdtemp(join(tmpdir(),'studiostack-hosting-'))
 try{
  await mkdir(join(root,'reports'));await mkdir(join(root,'_next/static'),{recursive:true})
  const html='<h1>StudioStack</h1><script src="/_next/static/app.js"></script>'
  await writeFile(join(root,'index.html'),html);await writeFile(join(root,'index.txt'),'root-flight')
  await writeFile(join(root,'reports/index.html'),html);await writeFile(join(root,'reports/index.txt'),'reports-flight')
  await writeFile(join(root,'_next/static/app.js'),'export default "current-build"')
  await prepareStaticRoutes(root)
  const send=(bad:'html'|'stale'|null=null)=>(async(input:Parameters<typeof fetch>[0])=>{
    const path=new URL(String(input)).pathname
    const file=join(root,path.endsWith('/')?path+'index.html':path)
    const data=await readFile(file)
    return new Response(bad==='stale'&&path==='/reports.txt'?'old-build':data,{headers:{'content-type':path.endsWith('.txt')?(bad==='html'?'text/html':'text/plain'):'text/html'}})
  }) as typeof fetch
  expect(await verifyStaticRoutes('https://studio.example',root,send())).toEqual({routes:2,files:6})
  await expect(verifyStaticRoutes('https://studio.example',root,send('html'))).rejects.toThrow('received HTML')
  await expect(verifyStaticRoutes('https://studio.example',root,send('stale'))).rejects.toThrow('mismatched build data')
 }finally{await rm(root,{recursive:true,force:true})}
})
