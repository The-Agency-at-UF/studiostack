import {mkdtemp,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {describe,expect,it} from 'vitest'
import {createBuildDirectory,selectedBuild,writeBuildManifest} from '../../scripts/database-build'
const clean={commit:'a'.repeat(40),clean:true}
async function build(source=clean){const root=await mkdtemp(`${tmpdir()}/database-builds-`),directory=await createBuildDirectory(source,root);await writeFile(`${directory}/runtime.zip`,'runtime');await writeFile(`${directory}/setup.zip`,'setup');await writeBuildManifest(directory,source);return {root,directory}}
describe('Database API build selection',()=>{
 it('gives every prepare run its own folder',async()=>{const root=await mkdtemp(`${tmpdir()}/database-builds-`);expect(await createBuildDirectory(clean,root)).not.toBe(await createBuildDirectory(clean,root))})
 it('returns the archives of a matching, unchanged build',async()=>{const {root,directory}=await build();expect(await selectedBuild('prod',{value:directory,root,source:clean})).toEqual({directory,runtime:`${directory}/runtime.zip`,setup:`${directory}/setup.zip`})})
 it('requires an explicit build created by prepare',async()=>{const {root,directory}=await build();await expect(selectedBuild('dev',{value:undefined,root,source:clean})).rejects.toThrow('DATABASE_API_BUILD');await expect(selectedBuild('dev',{value:root,root,source:clean})).rejects.toThrow('created by db:api:prepare');await expect(selectedBuild('dev',{value:`${directory}/..`,root,source:clean})).rejects.toThrow('created by db:api:prepare')})
 it('refuses a build from another commit',async()=>{const {root,directory}=await build();await expect(selectedBuild('dev',{value:directory,root,source:{commit:'b'.repeat(40),clean:true}})).rejects.toThrow('different commit')})
 it('refuses archives replaced after preparation',async()=>{const {root,directory}=await build();await writeFile(`${directory}/runtime.zip`,'someone else');await expect(selectedBuild('dev',{value:directory,root,source:clean})).rejects.toThrow('runtime.zip changed')})
 it('allows uncommitted builds in dev only',async()=>{const dirty={...clean,clean:false},{root,directory}=await build(dirty);expect((await selectedBuild('dev',{value:directory,root,source:dirty})).runtime).toBe(`${directory}/runtime.zip`);await expect(selectedBuild('prod',{value:directory,root,source:dirty})).rejects.toThrow('clean checkout');const committed=await build();await expect(selectedBuild('prod',{value:committed.directory,root:committed.root,source:dirty})).rejects.toThrow('clean checkout')})
})
