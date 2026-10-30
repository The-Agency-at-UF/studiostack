// @vitest-environment node
import {expect,it,vi} from 'vitest'
import {dispatchProduction} from '../../backend/production/repository'
import type {DatabaseClient} from '../../backend/database/client'
const lead='11111111-1111-4111-8111-111111111111',org='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333'
function fixture(designated=true,status='submitted'){
 const brief={id,organizationId:org,ownerId:'another-author',ownerName:'Author',status,version:1,submission:1,data:{projectName:'Shoot',client:'Client',productionTypes:['Videography'],deliveryDate:'2026-12-20',fields:{}},shootStartsAt:null,shootEndsAt:null}
 const query=vi.fn(async(sql:string)=>({rows:sql.includes('reviewer_ids AS')?[{version:1,reviewerIds:designated?[lead]:[],executiveIds:[],approvalConfirmsDates:true}]:sql.includes('FROM app.production_briefs b')?[brief]:sql.startsWith('INSERT INTO app.production_brief_events')?[{id}]:[]}))
 const client={query} as unknown as DatabaseClient
 const run=(resource:string,body?:unknown)=>dispatchProduction(client,{operation:'production',organizationId:org,resource,method:body?'POST':'GET',briefId:id,page:{limit:100,after:null},body},{organizationId:org,user:{id:lead,displayName:'Allison'},membership:{role:'member'}})
 return {run,query}
}
it('reports lead review access without administrator rights',async()=>{expect(await fixture().run('access')).toMatchObject({canReview:true,canAdminister:false})})
it.each(['approve','schedule','request_changes','deny'])('allows a designated member lead to %s another author’s brief',async action=>{
 const {run,query}=fixture(true,action==='schedule'?'approved':'submitted')
 await run('actions',{action,version:1,requestId:id,comment:'Production decision',...(['approve','schedule'].includes(action)?{shootStartsAt:'2026-11-02T00:00:00.000Z',shootEndsAt:'2026-11-03T00:00:00.000Z'}:{})})
 expect(query.mock.calls.some(([sql])=>sql.startsWith('UPDATE app.production_briefs SET status'))).toBe(true)
})
it.each(['approve','schedule','request_changes','deny'])('denies %s after lead designation is removed',async action=>{
 const {run}=fixture(false,action==='schedule'?'approved':'submitted')
 await expect(run('actions',{action,version:1,requestId:id,comment:'Reason',...(['approve','schedule'].includes(action)?{shootStartsAt:'2026-11-02T00:00:00.000Z',shootEndsAt:'2026-11-03T00:00:00.000Z'}:{})})).rejects.toMatchObject({status:403})
})
it('does not let a designated member lead administer production access',async()=>{await expect(fixture().run('settings')).rejects.toMatchObject({status:403})})

import {createApiRepository} from '../../backend/database/api-repository'
function bookings(designated=true,active=true){
 const query=vi.fn(async(sql:string,values:unknown[]=[])=>{void values;return {rows:sql.includes('FROM app.users WHERE')?[{id:lead}]:sql.includes('SELECT m.role FROM')?(active?[{role:'member'}]:[]):sql.includes('SELECT 1 FROM app.production_settings')?(designated?[{}]:[]):sql.includes('FROM app.reservations r WHERE')?[{id,userId:'another-member',name:'Organization shoot',equipmentIds:['camera']}]:[]}})
 const repository=createApiRepository({withClient:async(fn: (c:DatabaseClient)=>Promise<unknown>)=>fn({query} as unknown as DatabaseClient)} as Parameters<typeof createApiRepository>[0])
 const run=(operation:'reservations'|'reservation'|'cancelReservation')=>repository.execute({issuer:'issuer',subject:'subject',email:null},operation==='reservations'?{operation,organizationId:org,page:{limit:100,after:null}}:{operation,organizationId:org,reservationId:id})
 return {query,run}
}
it('lets a designated lead list named organization bookings as read-only',async()=>{
 const {run,query}=bookings();expect(await run('reservations')).toMatchObject({items:[{name:'Organization shoot',readOnly:true,equipmentIds:['camera']}]})
 expect(query.mock.calls.find(([sql])=>sql.includes('ORDER BY r.id LIMIT'))?.[1]?.[3]).toBe(true)
 expect(query.mock.calls.find(([sql])=>sql.includes('SELECT 1 FROM app.production_settings'))?.[1]).toEqual([org,lead])
})
it('lets a designated lead read a foreign booking but never cancel it',async()=>{
 const {run}=bookings();expect(await run('reservation')).toMatchObject({readOnly:true})
 await expect(run('cancelReservation')).rejects.toMatchObject({status:404})
})
it('removing lead designation removes access to foreign booking details',async()=>{await expect(bookings(false).run('reservation')).rejects.toMatchObject({status:404})})
it('inactive membership cannot use a remaining lead designation',async()=>{await expect(bookings(true,false).run('reservations')).rejects.toMatchObject({status:403})})

it('ordinary member booking lists remain restricted to their own records',async()=>{const {run,query}=bookings(false);await run('reservations');expect(query.mock.calls.find(([sql])=>sql.includes('ORDER BY r.id LIMIT'))?.[1]?.[3]).toBe(false)})
