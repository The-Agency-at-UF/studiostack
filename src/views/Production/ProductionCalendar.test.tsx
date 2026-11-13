import {cleanup,render,screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach,expect,it,vi} from 'vitest'
import ProductionCalendar from './ProductionCalendar'
import {emptyBrief,type ProductionBrief} from '../../types/production'
vi.mock('@fullcalendar/react',()=>({default:function CalendarStub({events,eventClick}:{events:{id:string;title:string;classNames:string[]}[];eventClick:(arg:unknown)=>void}){return <div>{events.map(e=><button key={e.id} data-kind={e.classNames.join(' ')} onClick={()=>eventClick({event:{id:e.id}})}>{e.title}</button>)}</div>}}))
afterEach(cleanup)
function brief(id:string,changes:Partial<ProductionBrief>,data:Partial<ProductionBrief['data']>,fields:Record<string,string>={}):ProductionBrief{
  const base=emptyBrief()
  return {id,organizationId:'org',ownerId:'author',ownerName:'Author',status:'approved',version:1,submission:1,shootStartsAt:null,shootEndsAt:null,attachments:[],events:[],crew:[],createdAt:'2026-11-01T00:00:00Z',updatedAt:'2026-11-01T00:00:00Z',...changes,data:{...base,projectName:id,client:'Athletics',productionTypes:['Videography'],...data,fields:{...base.fields,...fields}}} as ProductionBrief
}
const briefs=[
  brief('Recruitment film',{shootStartsAt:'2026-11-17T00:00:00.000Z',shootEndsAt:'2026-11-20T00:00:00.000Z',crew:[{userId:'a',name:'A',role:'Camera'},{userId:'b',name:'B',role:'Audio'}]} as Partial<ProductionBrief>,{deliveryDate:'2026-12-18'},{roughCut:'2026-12-02'}),
  brief('Alumni portraits',{status:'submitted'},{},{proposedStart:'2026-11-12',proposedEnd:'2026-11-13'}),
  brief('Library promo',{},{},{shootEstimate:'1 day'}),
]
it('shows a selected event in the side panel and opens its brief from there',async()=>{
  const user=userEvent.setup(),onOpen=vi.fn()
  render(<ProductionCalendar briefs={briefs} onOpen={onOpen}/>)
  expect(screen.getByText('Select a shoot or milestone on the calendar to see its brief.')).toBeInTheDocument()
  await user.click(screen.getByRole('button',{name:'Recruitment film'}))
  const panel=screen.getByLabelText('Selected production event')
  expect(panel).toHaveTextContent('Confirmed shoot')
  expect(panel).toHaveTextContent('Nov 17 – Nov 19 · Confirmed')
  expect(panel).toHaveTextContent('2 crew assigned')
  expect(panel).toHaveTextContent('Rough cut')
  expect(onOpen).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button',{name:'Open production brief'}))
  expect(onOpen).toHaveBeenCalledWith('Recruitment film')
})
it('styles each kind of event and hides tentative shoots and milestones on request',async()=>{
  const user=userEvent.setup()
  render(<ProductionCalendar briefs={briefs} onOpen={vi.fn()}/>)
  expect(screen.getByRole('button',{name:'Recruitment film'})).toHaveAttribute('data-kind',expect.stringContaining('ws-event--shoot'))
  expect(screen.getByRole('button',{name:'Alumni portraits · tentative'})).toHaveAttribute('data-kind',expect.stringContaining('ws-event--tentative'))
  expect(screen.getByRole('button',{name:'Recruitment film · Delivery'})).toHaveAttribute('data-kind',expect.stringContaining('ws-event--milestone'))
  await user.click(screen.getByRole('checkbox',{name:'Tentative shoots'}))
  await user.click(screen.getByRole('checkbox',{name:'Milestones'}))
  expect(screen.queryByRole('button',{name:'Alumni portraits · tentative'})).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'Recruitment film · Delivery'})).not.toBeInTheDocument()
})
it('lists photo and video briefs that still need a shoot date',async()=>{
  const user=userEvent.setup(),onOpen=vi.fn()
  render(<ProductionCalendar briefs={briefs} onOpen={onOpen}/>)
  await user.click(screen.getByRole('button',{name:/Library promo/}))
  expect(onOpen).toHaveBeenCalledWith('Library promo')
  expect(screen.getByLabelText('Awaiting shoot dates')).toHaveTextContent('Est. 1 day')
})
