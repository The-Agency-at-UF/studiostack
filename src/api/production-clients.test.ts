import {describe,expect,it,vi} from 'vitest'
import {canDeleteClient,dispatchClients} from '../../backend/production/clients'
import type {DatabaseClient} from '../../backend/database/client'
import type {ProductionRequest} from '../../backend/production/repository'

const org='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222',creator='33333333-3333-4333-8333-333333333333',other='44444444-4444-4444-8444-444444444444'
const patch=(deleted:boolean,name='Acme'):ProductionRequest=>({operation:'production',organizationId:org,resource:'clients',method:'PATCH',clientId:id,body:{name,deleted,version:1},page:{limit:100,after:null}})
function database(row:{name:string;version:number;createdBy:string|null;deletedAt:string|null}){
  const query=vi.fn(async(sql:string,_values?:unknown[])=>sql.startsWith('SELECT name,version')?{rows:[row]}:sql.startsWith('SELECT id FROM')?{rows:[]}:{rows:[{id,deleted:true}]})
  return {client:{query} as unknown as DatabaseClient,query}
}
describe('client account deletion permissions',()=>{
  it('lets owners, administrators and the creator delete, and nobody else',()=>{
    expect(canDeleteClient({userId:other,canManage:false,admin:true},creator)).toBe(true)
    expect(canDeleteClient({userId:creator,canManage:false,admin:false},creator)).toBe(true)
    expect(canDeleteClient({userId:other,canManage:true,admin:false},creator)).toBe(false)
    expect(canDeleteClient({userId:other,canManage:true,admin:false},null)).toBe(false)
  })
  it('refuses Production leadership deleting an account someone else added, before any write',async()=>{
    const {client,query}=database({name:'Acme',version:1,createdBy:creator,deletedAt:null})
    await expect(dispatchClients(client,patch(true),{userId:other,canManage:true,admin:false})).rejects.toMatchObject({status:403})
    expect(query.mock.calls.some(([sql])=>String(sql).startsWith('UPDATE'))).toBe(false)
  })
  it('lets a creator who is no longer in leadership delete and restore their own account',async()=>{
    for(const [deleted,deletedAt] of [[true,null],[false,'2026-11-13T00:00:00Z']] as const){
      const {client,query}=database({name:'Acme',version:1,createdBy:creator,deletedAt})
      await dispatchClients(client,patch(deleted),{userId:creator,canManage:false,admin:false})
      expect(query.mock.calls.find(([sql])=>String(sql).startsWith('UPDATE'))?.[1]).toEqual([org,id,'Acme',deleted,creator])
    }
  })
  it('keeps renaming with leadership and treats the older archive flag as delete',async()=>{
    const {client,query}=database({name:'Acme',version:1,createdBy:creator,deletedAt:null})
    await expect(dispatchClients(client,patch(false,'Acme Co'),{userId:creator,canManage:false,admin:false})).rejects.toMatchObject({status:403})
    await expect(dispatchClients(client,{...patch(true),body:{name:'Acme',archived:true,version:1}},{userId:other,canManage:true,admin:false})).rejects.toMatchObject({status:403})
    await expect(dispatchClients(client,{...patch(true),body:{name:'Acme',archived:true,deleted:true,version:1}},{userId:creator,canManage:true,admin:true})).rejects.toMatchObject({status:400})
    await dispatchClients(client,{...patch(true),body:{name:'Acme',archived:true,version:1}},{userId:creator,canManage:false,admin:false})
    expect(query.mock.calls.find(([sql])=>String(sql).startsWith('UPDATE'))?.[1]).toEqual([org,id,'Acme',true,creator])
  })
})
