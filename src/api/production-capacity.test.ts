// @vitest-environment node
import {expect,it} from 'vitest'
import {assertProductionCapacity,productionCapacity} from '../../infra/production/capacity'

it('refuses the former account quota and bounds runtime connections below the login cap',()=>{
  expect(()=>assertProductionCapacity(10)).toThrow('reservable')
  expect(()=>assertProductionCapacity(1000)).not.toThrow()
  expect(productionCapacity.reservedConcurrency).toBeLessThan(productionCapacity.databaseConnections)
  expect(productionCapacity.routeSettings.ThrottlingRateLimit).toBeLessThanOrEqual(10*productionCapacity.reservedConcurrency)
})
