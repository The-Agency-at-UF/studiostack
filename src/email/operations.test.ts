import {describe,it,expect} from 'vitest'
import {operationsInfrastructure} from '../../infra/production/operations'
describe('Operational ownership and cost controls',()=>{
 it('routes alarms to the approved recipient and own account/topic',()=>{const t=operationsInfrastructure('rmckenzie1@ufl.edu',10);expect(JSON.stringify(t)).toContain('alarm:studiostack-*');expect(JSON.stringify(t.Resources)).toContain('rmckenzie1@ufl.edu');expect(JSON.stringify(t.Resources)).not.toContain('My Zero-Spend Budget')})
 it('adds its own budget without changing the existing budget',()=>{const b=operationsInfrastructure('rmckenzie1@ufl.edu',10).Resources.Budget as {Properties:{Budget:{BudgetName:string;BudgetLimit:{Amount:number}}}};expect(b.Properties.Budget).toMatchObject({BudgetName:'StudioStack Monthly Infrastructure',BudgetLimit:{Amount:100}})})
 it('alarms the prod Aurora cluster by default and the RDS instance once it exists',()=>{
  type Alarm={Properties:{AlarmName:string;MetricName:string;Dimensions:{Name:string;Value:string}[];ComparisonOperator:string}}
  const names=(databases?:('aurora'|'instance')[])=>Object.values(operationsInfrastructure('rmckenzie1@ufl.edu',10,databases).Resources).filter(r=>(r as {Type:string}).Type==='AWS::CloudWatch::Alarm').map(r=>(r as Alarm).Properties.AlarmName)
  expect(names()).toContain('studiostack-prod-database-connections');expect(names()).not.toContain('studiostack-prod-pg-connections')
  expect(names(['aurora','instance'])).toEqual(expect.arrayContaining(['studiostack-prod-database-connections','studiostack-prod-pg-connections','studiostack-dev-database-connections']))
  const after=names(['instance']);expect(after).not.toContain('studiostack-prod-database-connections');expect(after).toContain('studiostack-dev-database-connections')
  const r=operationsInfrastructure('rmckenzie1@ufl.edu',10,['instance']).Resources as Record<string,Alarm>
  expect(r.prodInstanceConnections.Properties.Dimensions).toEqual([{Name:'DBInstanceIdentifier',Value:'studiostack-prod-pg'}])
  expect(r.prodInstanceCpuCredits.Properties).toMatchObject({MetricName:'CPUCreditBalance',ComparisonOperator:'LessThanThreshold'})
  expect(r.prodInstanceStorage.Properties).toMatchObject({MetricName:'FreeStorageSpace',ComparisonOperator:'LessThanThreshold'})
  expect(()=>operationsInfrastructure('rmckenzie1@ufl.edu',10,[])).toThrow()
 })
 it('refuses an unapproved operational recipient',()=>{expect(()=>operationsInfrastructure('other@example.com',10)).toThrow()})
})
