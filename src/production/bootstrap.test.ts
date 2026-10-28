// @vitest-environment node
import {afterEach,describe,it,expect,vi} from 'vitest'
import {bootstrapProductionAdmin} from '../../backend/production/bootstrap'
import type {DatabaseConfig} from '../../backend/database/config'
import type {createDatabase} from '../../backend/database/client'
const input={action:'bootstrap-production-admin',subject:'11111111-1111-4111-8111-111111111111',email:'rmckenzie1@ufl.edu'},config={environment:'prod'} as DatabaseConfig
const database=(transaction:ReturnType<typeof vi.fn>)=>({transaction}) as unknown as ReturnType<typeof createDatabase>
afterEach(()=>vi.unstubAllEnvs())
describe('Production owner onboarding',()=>{
 it('requires explicit production maintenance authorization before accessing the database',async()=>{vi.stubEnv('COGNITO_USER_POOL_ID','us-east-2_test');vi.stubEnv('ALLOW_PRODUCTION_OWNER_BOOTSTRAP','');const tx=vi.fn();await expect(bootstrapProductionAdmin(database(tx),config,input)).rejects.toThrow('Approved');expect(tx).not.toHaveBeenCalled()})
 it('cannot onboard a different address even with the maintenance flag',async()=>{vi.stubEnv('COGNITO_USER_POOL_ID','us-east-2_test');vi.stubEnv('ALLOW_PRODUCTION_OWNER_BOOTSTRAP','yes');const tx=vi.fn();await expect(bootstrapProductionAdmin(database(tx),config,{...input,email:'other@ufl.edu'})).rejects.toThrow('Approved');expect(tx).not.toHaveBeenCalled()})
 it('uses the chosen pool identity and maintenance purpose for the approved owner',async()=>{vi.stubEnv('COGNITO_USER_POOL_ID','us-east-2_test');vi.stubEnv('ALLOW_PRODUCTION_OWNER_BOOTSTRAP','yes');const query=vi.fn().mockResolvedValue({rows:[{id:'fixture-id'}]}),tx=vi.fn(operation=>operation({query}));expect(await bootstrapProductionAdmin(database(tx),config,input)).toMatchObject({ok:true});expect(tx).toHaveBeenCalledWith(expect.any(Function),'maintenance');expect(query.mock.calls[0][1]).toContain('https://cognito-idp.us-east-2.amazonaws.com/us-east-2_test')})
})
