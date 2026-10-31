// @vitest-environment node
import {afterEach,describe,it,expect,vi} from 'vitest'
import {handOverAgencyOwnership} from '../../backend/production/owner-handover'
import type {DatabaseConfig} from '../../backend/database/config'
import type {createDatabase} from '../../backend/database/client'
const owner={subject:'11111111-1111-4111-8111-111111111111',email:'mckenzieroger83@gmail.com'},formerOwner={subject:'22222222-2222-4222-8222-222222222222',email:'rmckenzie1@ufl.edu'}
const input={action:'hand-over-agency-ownership',owner,formerOwner},config={environment:'prod'} as DatabaseConfig
const database=(transaction:ReturnType<typeof vi.fn>)=>({transaction}) as unknown as ReturnType<typeof createDatabase>
// Minimal in-memory stand-in for the four tables the handover touches.
function fake(memberships:Record<string,{role:string;status:string}>,users:Record<string,string>={[owner.subject]:'owner-id',[formerOwner.subject]:'former-id'}){
 const audits:unknown[][]=[]
 const query=vi.fn(async(sql:string,params:unknown[]=[])=>{
  if(sql.includes('FROM app.organizations'))return {rows:[{id:'org'}]}
  if(sql.includes('FROM app.users'))return {rows:users[params[1] as string]?[{id:users[params[1] as string]}]:[]}
  if(sql.startsWith('SELECT role,status'))return {rows:memberships[params[1] as string]?[{...memberships[params[1] as string]}]:[]}
  if(sql.startsWith('INSERT INTO app.organization_memberships'))memberships[params[1] as string]={role:'owner',status:'active'}
  else if(sql.includes("SET role='owner'"))memberships[params[1] as string]={role:'owner',status:'active'}
  else if(sql.includes("SET role='member'"))memberships[params[1] as string]={...memberships[params[1] as string],role:'member'}
  else if(sql.includes('organization_audit_events'))audits.push(params)
  else if(sql.includes('count(*)'))return {rows:[{count:Object.values(memberships).filter(m=>m.role==='owner'&&m.status==='active').length}]}
  return {rows:[]}
 })
 return {memberships,audits,tx:vi.fn(operation=>operation({query}))}
}
afterEach(()=>vi.unstubAllEnvs())
describe('Agency ownership handover',()=>{
 it('requires production maintenance authorization before touching the database',async()=>{vi.stubEnv('COGNITO_USER_POOL_ID','us-east-2_test');vi.stubEnv('ALLOW_PRODUCTION_OWNER_BOOTSTRAP','');const tx=vi.fn();await expect(handOverAgencyOwnership(database(tx),config,input)).rejects.toThrow('Approved');expect(tx).not.toHaveBeenCalled()})
 it('only accepts the approved addresses',async()=>{vi.stubEnv('COGNITO_USER_POOL_ID','us-east-2_test');vi.stubEnv('ALLOW_PRODUCTION_OWNER_BOOTSTRAP','yes');const tx=vi.fn()
  await expect(handOverAgencyOwnership(database(tx),config,{...input,owner:{...owner,email:'other@example.com'}})).rejects.toThrow('Approved')
  await expect(handOverAgencyOwnership(database(tx),config,{...input,formerOwner:{...formerOwner,email:'other@ufl.edu'}})).rejects.toThrow('Approved');expect(tx).not.toHaveBeenCalled()})
 it('makes the Gmail account owner first, then the UF owner a member, with audit events',async()=>{vi.stubEnv('COGNITO_USER_POOL_ID','us-east-2_test');vi.stubEnv('ALLOW_PRODUCTION_OWNER_BOOTSTRAP','yes')
  const f=fake({'former-id':{role:'owner',status:'active'}})
  expect(await handOverAgencyOwnership(database(f.tx),config,input)).toMatchObject({ok:true,owner:{role:'owner'},formerOwner:{role:'member',status:'active'},activeOwners:1})
  expect(f.memberships).toEqual({'owner-id':{role:'owner',status:'active'},'former-id':{role:'member',status:'active'}})
  expect(f.audits).toHaveLength(2);expect(f.tx).toHaveBeenCalledWith(expect.any(Function),'maintenance')})
 it('promotes an existing member and is a no-op when already done',async()=>{vi.stubEnv('COGNITO_USER_POOL_ID','us-east-2_test');vi.stubEnv('ALLOW_PRODUCTION_OWNER_BOOTSTRAP','yes')
  const f=fake({'owner-id':{role:'member',status:'active'},'former-id':{role:'owner',status:'active'}})
  await handOverAgencyOwnership(database(f.tx),config,input);expect(f.memberships['owner-id'].role).toBe('owner')
  await handOverAgencyOwnership(database(f.tx),config,input);expect(f.audits).toHaveLength(2)})
 it('refuses when the new owner has never signed in, and skips a former owner who is absent',async()=>{vi.stubEnv('COGNITO_USER_POOL_ID','us-east-2_test');vi.stubEnv('ALLOW_PRODUCTION_OWNER_BOOTSTRAP','yes')
  await expect(handOverAgencyOwnership(database(fake({},{}).tx),config,input)).rejects.toThrow('not signed in')
  const f=fake({},{[owner.subject]:'owner-id'})
  expect(await handOverAgencyOwnership(database(f.tx),config,input)).toMatchObject({formerOwner:null,activeOwners:1})})
})
