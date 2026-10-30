import {describe,it,expect} from 'vitest'
import {operationsInfrastructure} from '../../infra/production/operations'
describe('Operational ownership and cost controls',()=>{
 it('routes alarms to the approved recipient and own account/topic',()=>{const t=operationsInfrastructure('rmckenzie1@ufl.edu',10);expect(JSON.stringify(t)).toContain('alarm:studiostack-*');expect(JSON.stringify(t.Resources)).toContain('rmckenzie1@ufl.edu');expect(JSON.stringify(t.Resources)).not.toContain('My Zero-Spend Budget')})
 it('adds its own budget without changing the existing budget',()=>{const b=operationsInfrastructure('rmckenzie1@ufl.edu',10).Resources.Budget as {Properties:{Budget:{BudgetName:string;BudgetLimit:{Amount:number}}}};expect(b.Properties.Budget).toMatchObject({BudgetName:'StudioStack Monthly Infrastructure',BudgetLimit:{Amount:100}})})
 it('refuses an unapproved operational recipient',()=>{expect(()=>operationsInfrastructure('other@example.com',10)).toThrow()})
})
