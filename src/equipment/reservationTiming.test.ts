import {describe,expect,it} from 'vitest'
import type {EquipmentReservation} from '../types/equipment'
import {defaultPickup,isMissed} from './reservationTiming'

const booking=(over:Partial<EquipmentReservation>)=>({status:'confirmed',fulfillmentStatus:'reserved',endsAt:'2026-11-13T18:00:00Z',...over}) as EquipmentReservation
const now=Date.parse('2026-11-19T12:00:00Z')

describe('isMissed',()=>{
  it('marks a past booking that was never picked up',()=>expect(isMissed(booking({}),now)).toBe(true))
  it('leaves future, checked-out, returned and cancelled bookings alone',()=>{
    expect(isMissed(booking({endsAt:'2026-11-20T18:00:00Z'}),now)).toBe(false)
    expect(isMissed(booking({fulfillmentStatus:'checked_out'}),now)).toBe(false)
    expect(isMissed(booking({fulfillmentStatus:'returned'}),now)).toBe(false)
    expect(isMissed(booking({status:'cancelled'}),now)).toBe(false)
  })
})

describe('defaultPickup',()=>{
  const local=(h:number,m=0)=>{const d=new Date(2026,10,19,h,m);return d}
  it('uses the next half hour during the day',()=>{const d=defaultPickup(local(13,5));expect([d.getDate(),d.getHours(),d.getMinutes()]).toEqual([19,13,30])})
  it('moves an early-morning start to 10 AM the same day',()=>{const d=defaultPickup(local(0,20));expect([d.getDate(),d.getHours(),d.getMinutes()]).toEqual([19,10,0])})
  it('moves an evening start to 10 AM the next day',()=>{const d=defaultPickup(local(21,0));expect([d.getDate(),d.getHours(),d.getMinutes()]).toEqual([20,10,0])})
})
