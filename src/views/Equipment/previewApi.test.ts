// @vitest-environment node
import {afterEach,describe,expect,it,vi} from 'vitest'
vi.unmock('../../data/localStore')
import {previewEquipmentApi as api} from './previewApi'
import {db,doc,deleteDoc} from '../../data/localStore'
const cleanup:Array<()=>Promise<void>>=[]
afterEach(async()=>{await Promise.all(cleanup.splice(0).map(f=>f()));vi.restoreAllMocks()})
describe('Isolated equipment preview',()=>{
 it('uses the same inventory and booking interfaces without network calls',async()=>{
  const fetch=vi.spyOn(globalThis,'fetch');const code='PREVIEW-'+crypto.randomUUID(),org='preview'
  const item=await api.createEquipment(org,{equipmentCode:code,name:'Preview light',category:'Lights'});cleanup.push(()=>deleteDoc(doc(db,'inventory',code)))
  expect((await api.inventory(org)).items).toContainEqual(expect.objectContaining({id:item.id,name:'Preview light'}))
  const start=new Date(Date.now()+3600000).toISOString(),end=new Date(Date.now()+7200000).toISOString()
  const booking=await api.createReservation(org,{name:'Preview shoot',startsAt:start,endsAt:end,equipmentIds:[item.id],requestId:crypto.randomUUID()});cleanup.push(()=>deleteDoc(doc(db,'reservations',booking.id)))
  expect((await api.reservations(org)).items).toContainEqual(expect.objectContaining({id:booking.id,equipmentIds:[item.id]}))
  expect((await api.equipment(org).availability(start,end)).items).toContainEqual(expect.objectContaining({id:booking.id}))
  expect(fetch).not.toHaveBeenCalled()
 })
})
