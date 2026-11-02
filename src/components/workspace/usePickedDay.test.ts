import {act,renderHook} from '@testing-library/react'
import {describe,expect,it} from 'vitest'
import type {DateClickArg} from '@fullcalendar/interaction'
import type {DayCellContentArg} from '@fullcalendar/core'
import {dayKey,usePickedDay} from './usePickedDay'
const cell=(date:Date)=>({date}) as DayCellContentArg
describe('usePickedDay',()=>{
  it('keys UTC calendars by UTC fields and local calendars by local fields',()=>{
    const d=new Date(Date.UTC(2026,10,2,12))
    expect(dayKey(d,true)).toBe('2026-11-02')
    expect(dayKey(new Date(2026,10,2,12),false)).toBe('2026-11-02')
  })
  it('marks only the clicked day, including clicks on time slots',()=>{
    const {result}=renderHook(()=>usePickedDay({utc:true}))
    expect(result.current.dayCellClassNames(cell(new Date(Date.UTC(2026,10,2))))).toEqual([])
    act(()=>result.current.dateClick({dateStr:'2026-11-02T10:00:00Z'} as DateClickArg))
    expect(result.current.picked).toBe('2026-11-02')
    expect(result.current.dayCellClassNames(cell(new Date(Date.UTC(2026,10,2))))).toEqual(['ws-day-picked'])
    expect(result.current.dayCellClassNames(cell(new Date(Date.UTC(2026,10,3))))).toEqual([])
  })
})
