// @vitest-environment node
import {expect,it,vi} from 'vitest'
import {dispatchProduction} from '../../backend/production/repository'
import type {DatabaseClient} from '../../backend/database/client'
const author='11111111-1111-4111-8111-111111111111',org='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333'
function fixture(brief:{ownerId?:string;status?:string;submission?:number}={},role='member'){
 const row={id,organizationId:org,ownerId:author,ownerName:'Author',status:'draft',version:1,submission:0,data:{projectName:'',client:'',productionTypes:[],deliveryDate:'',fields:{}},shootStartsAt:null,shootEndsAt:null,...brief}
 const query=vi.fn(async(sql:string)=>({rows:sql.includes('FROM app.production_briefs b')?[row]:[]}))
 const run=()=>dispatchProduction({query} as unknown as DatabaseClient,{operation:'production',organizationId:org,resource:'briefs',method:'DELETE',briefId:id,page:{limit:100,after:null}},{organizationId:org,user:{id:author},membership:{role}})
 return {run,writes:()=>query.mock.calls.map(([sql])=>sql).filter(sql=>/^(UPDATE|DELETE|INSERT)/.test(sql))}
}
it('lets the author delete a never-submitted draft by hiding it, never removing rows',async()=>{
 const {run,writes}=fixture()
 expect(await run()).toEqual({id})
 expect(writes()).toEqual(['UPDATE app.production_briefs SET deleted_at = now(), updated_at = now() WHERE organization_id = $1 AND id = $2'])
})
it.each([
 ['the author deletes a reopened draft with review history',{status:'draft',submission:1},'member'],
 ['the author deletes a withdrawn brief',{status:'withdrawn',submission:1},'member'],
 ['an admin deletes another author’s draft',{ownerId:'someone-else'},'admin'],
 ['an owner deletes another author’s denied brief',{ownerId:'someone-else',status:'denied',submission:1},'owner'],
])('hides the brief when %s',async(_,brief,role)=>{
 const {run,writes}=fixture(brief,role)
 expect(await run()).toEqual({id})
 expect(writes()).toHaveLength(1)
})
it('refuses another member’s brief',async()=>{
 const {run,writes}=fixture({ownerId:'someone-else',status:'withdrawn',submission:1},'member')
 await expect(run()).rejects.toMatchObject({status:403})
 expect(writes()).toEqual([])
})
it.each(['submitted','approved','changes_requested'])('asks to withdraw an active %s brief before deleting it',async status=>{
 const {run,writes}=fixture({status,submission:1},'admin')
 await expect(run()).rejects.toMatchObject({status:409,message:'Withdraw this brief before deleting it'})
 expect(writes()).toEqual([])
})
