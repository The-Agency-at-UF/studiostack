// @vitest-environment node
import {expect,it} from 'vitest'
import {reservationInstants} from './wallTime'

it('LOGIC-020: rejects DST gaps and offers both instants for a repeated local time',()=>{
  const prior=process.env.TZ
  process.env.TZ='America/New_York'
  try {
    expect(reservationInstants('2026-03-08T02:30')).toEqual([])
    expect(reservationInstants('2026-11-01T01:30')).toEqual(['2026-11-01T05:30:00.000Z','2026-11-01T06:30:00.000Z'])
    expect(reservationInstants('2026-11-01T01:30','2026-11-01T06:30:12.345Z')).toEqual(['2026-11-01T06:30:12.345Z'])
  } finally {
    if(prior===undefined)delete process.env.TZ
    else process.env.TZ=prior
  }
})
