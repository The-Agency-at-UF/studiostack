// @vitest-environment node
import {describe,expect,it} from 'vitest'
import {editReservation,fulfillReservation,createReport,updateReport} from '../../backend/equipment/validation'
const id='11111111-1111-4111-8111-111111111111',base={version:1,requestId:id}
describe('Equipment workflow inputs',()=>{
 it('requires unique condition records and valid versions',()=>{expect(fulfillReservation({...base,conditions:[{equipmentId:id,condition:'good'}]}).conditions[0].notes).toBe('');expect(()=>fulfillReservation({...base,conditions:[{equipmentId:id,condition:'good'},{equipmentId:id,condition:'damaged'}]})).toThrow();expect(()=>fulfillReservation({...base,version:0,conditions:[]})).toThrow()})
 it('normalizes reservation edits without trusting a caller clock',()=>{expect(editReservation({...base,name:'Shoot',startsAt:'2026-12-01T12:00:00Z',endsAt:'2026-12-02T12:00:00Z',equipmentIds:[id]}).startsAt).toBe('2026-12-01T12:00:00.000Z')})
 it('accepts multiline descriptions and requires a real resolution',()=>{expect(createReport({equipmentId:id,title:'Damage',description:'Line one\nLine two',severity:'high',requestId:id}).description).toContain('\n');expect(()=>updateReport({...base,status:'resolved',resolution:'',restoreService:false})).toThrow();expect(()=>updateReport({...base,status:'open',resolution:'',restoreService:true})).toThrow()})
})
