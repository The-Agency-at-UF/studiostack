import {useEffect} from 'react'
import {cleanup,render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import LiveEquipmentCalendar from './Calendar'
const m=vi.hoisted(()=>({availability:vi.fn(),inventory:vi.fn(),reservations:vi.fn(),api:{} as Record<string,unknown>}))
m.api={inventory:m.inventory,reservations:m.reservations,equipment:()=>({availability:m.availability})}
vi.mock('./live',async()=>({...await vi.importActual('./live'),useLiveOrganization:()=>({api:m.api,organization:{id:'org'}})}))
vi.mock('@fullcalendar/react',()=>({default:function CalendarStub({datesSet,events,eventClick}:{datesSet:(arg:unknown)=>void;events:{id:string;title:string}[];eventClick:(arg:unknown)=>void}){useEffect(()=>{datesSet({start:new Date('2026-10-01'),end:new Date('2026-11-08')})},[datesSet]);return <div>{events.map(e=><button key={e.id} onClick={()=>eventClick({event:{id:e.id}})}>{e.title}</button>)}</div>}}))
const date='2026-10-28T12:00:00Z',row={id:'mine',equipmentIds:['camera'],startsAt:date,endsAt:'2026-10-28T13:00:00Z',fulfillmentStatus:'reserved'},page=(items:unknown[])=>({items,nextCursor:null})
beforeEach(()=>{vi.clearAllMocks();m.inventory.mockResolvedValue(page([{id:'camera',name:'Camera',equipmentCode:'CAM-1',status:'available',condition:'good'},{id:'mic',name:'Microphone',equipmentCode:'MIC-1'}]));m.reservations.mockResolvedValue(page([{...row,name:'My campaign'}]));m.availability.mockResolvedValue(page([row,{...row,id:'private'}]))})
afterEach(cleanup)
describe('Live equipment calendar',()=>{
 it('loads only the visible window and keeps other borrower details private',async()=>{render(<LiveEquipmentCalendar/>);expect(await screen.findByRole('button',{name:'My campaign'})).toBeInTheDocument();expect(screen.getByRole('button',{name:'Reserved equipment'})).toBeInTheDocument();expect(m.availability).toHaveBeenCalledWith('2026-10-01T00:00:00.000Z','2026-11-08T00:00:00.000Z',undefined)})
 it('links owned bookings to their real reservation and hides that action for foreign bookings',async()=>{const u=userEvent.setup();render(<LiveEquipmentCalendar/>);await u.click(await screen.findByRole('button',{name:'My campaign'}));expect(screen.getByRole('link',{name:/View reservation/})).toHaveAttribute('href','/reservations?reservation=mine');await u.click(screen.getByRole('button',{name:'Reserved equipment'}));expect(screen.queryByRole('link',{name:/View reservation/})).not.toBeInTheDocument();expect(screen.getByLabelText('Selected equipment booking')).toHaveTextContent('Camera')})
 it('filters by actual equipment IDs',async()=>{const u=userEvent.setup();render(<LiveEquipmentCalendar/>);await screen.findByRole('button',{name:'My campaign'});await u.selectOptions(screen.getByLabelText('Filter equipment'),'mic');expect(screen.queryByRole('button',{name:'My campaign'})).not.toBeInTheDocument();expect(screen.getByText('No equipment bookings in this period.')).toBeInTheDocument()})
 it('shows a service failure without pretending the calendar is empty',async()=>{m.availability.mockRejectedValue(new Error('secret'));render(<LiveEquipmentCalendar/>);await waitFor(()=>expect(screen.getByRole('alert')).toBeInTheDocument());expect(screen.queryByText('No equipment bookings in this period.')).not.toBeInTheDocument()})
})
