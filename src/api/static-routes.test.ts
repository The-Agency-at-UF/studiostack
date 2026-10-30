// @vitest-environment node
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {expect,it} from 'vitest'
import {prepareStaticRoutes} from '../../scripts/prepare-static-routes'
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
