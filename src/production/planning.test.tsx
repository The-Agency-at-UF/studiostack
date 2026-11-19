import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {productionReadiness,softHoldsFor} from './readiness'
import {emptyBrief,type ProductionBrief} from '../types/production'
import {briefCommand,briefData} from '../../backend/production/validation'
import {createEquipment,updateEquipment} from '../../backend/database/api-validation'
import {isOverdue} from '../equipment/reservationPolicy'
import type {EquipmentReservation} from '../types/equipment'
import BriefUploads from '../views/Production/BriefUploads'
import {validBriefFile} from './uploads'
import IdeaBoard from '../views/Production/IdeaBoard'
import ProductionCalendar from '../views/Production/ProductionCalendar'
vi.mock('@fullcalendar/react',()=>({default:({events}:{events:{id:string;title:string}[]})=><div>{events.map(e=><p key={e.id}>{e.title}</p>)}</div>}))
afterEach(cleanup)
const now=Date.parse('2026-11-18T12:00:00Z'),start='2026-11-19T12:00:00.000Z',end='2026-11-19T13:00:00.000Z',id='11111111-1111-4111-8111-111111111111'
function brief():ProductionBrief{return {id,organizationId:'org',ownerId:'author',ownerName:'Alex',status:'submitted',data:{...emptyBrief(),projectName:'Test shoot',productionTypes:['Videography']},version:1,submission:1,shootStartsAt:null,shootEndsAt:null,softHolds:[{id,startsAt:start,endsAt:end}],createdAt:start,updatedAt:start,events:[],attachments:[]}}
describe('production planning policies',()=>{
 it('flags all three missing prerequisites within three days and clears when the requested crew is filled',()=>{
  const b=brief();expect(productionReadiness(b,now)).toMatchObject({flagged:true,missing:['Approved shoot date','Approved brief','Confirmed crew members']})
  b.status='approved';b.shootStartsAt=start;b.shootEndsAt=end;b.data.crewRequests=[{id,role:'Videographer',startsAt:start,endsAt:end,location:'Studio'}];b.crew=[{userId:'crew',name:'Jordan',role:'Videographer',crewRequestId:'wrong'}]
  expect(productionReadiness(b,now).missing).toEqual(['Confirmed crew members'])
  b.crew[0].crewRequestId=id;expect(productionReadiness(b,now)).toMatchObject({missing:[],flagged:false})
  b.status='denied';expect(productionReadiness(b,now).flagged).toBe(false)
 })
 it('uses explicit empty proposals instead of reviving the legacy window',()=>{const b=brief();b.data.fields={proposedStart:'2026-11-20',proposedEnd:'2026-11-20'};b.softHolds=[];expect(softHoldsFor(b)).toEqual([]);b.softHolds=null;expect(softHoldsFor(b)).toHaveLength(1)})
 it('validates crew positions, real dates, proposal IDs and SD card tags',()=>{
  expect(()=>briefData({...emptyBrief(),crewRequests:[{id,role:'Camera wizard',startsAt:start,endsAt:end,location:'Studio'}]})).toThrow()
  expect(()=>briefCommand({action:'propose_dates',version:1,requestId:id,softHolds:[{id,startsAt:end,endsAt:start}]})).toThrow()
  expect(()=>briefCommand({action:'propose_dates',version:1,requestId:id,softHolds:[{id,startsAt:start,endsAt:end},{id,startsAt:start,endsAt:end}]})).toThrow()
  expect(()=>briefCommand({action:'schedule',version:1,requestId:id,shootStartsAt:'2026-02-30T12:00:00Z',shootEndsAt:'2026-03-04T12:00:00Z'})).toThrow()
  expect(createEquipment({equipmentCode:'SD-1',name:'Interview card',category:'SD Cards',colorTag:'red'})).toMatchObject({category:'SD Cards',colorTag:'red'})
  expect(()=>updateEquipment({colorTag:'invisible'})).toThrow()
 })
 it('only marks actual checked-out late reservations overdue',()=>{const r={status:'confirmed',fulfillmentStatus:'checked_out',endsAt:start} as EquipmentReservation;expect(isOverdue(r,Date.parse(end))).toBe(true);expect(isOverdue({...r,fulfillmentStatus:'returned'},Date.parse(end))).toBe(false);expect(isOverdue({...r,status:'cancelled'},Date.parse(end))).toBe(false)})
})
describe('planning surfaces',()=>{
 it('defaults soft holds off for members, on for leadership and keeps both toggleable',async()=>{
  const user=userEvent.setup(),b=brief(),view=render(<ProductionCalendar briefs={[b]} onOpen={vi.fn()} showSoftHoldsByDefault={false}/>)
  expect(screen.getByRole('checkbox',{name:'Soft holds (unconfirmed)'})).not.toBeChecked();expect(screen.queryByText(/Test shoot · unconfirmed/)).not.toBeInTheDocument()
  await user.click(screen.getByRole('checkbox',{name:'Soft holds (unconfirmed)'}));expect(screen.getByText(/Test shoot · unconfirmed/)).toBeInTheDocument()
  view.unmount();render(<ProductionCalendar briefs={[b]} onOpen={vi.fn()} showSoftHoldsByDefault/>)
  expect(screen.getByRole('checkbox',{name:'Soft holds (unconfirmed)'})).toBeChecked()
 })
 it('keeps pre-production milestones and treats explicit soft holds as scheduled proposals',()=>{const b=brief();b.data.fields={conceptReview:'2026-11-18',locationConfirmed:'2026-11-19',paperworkDue:'2026-11-20',assetsDue:'2026-11-21'};render(<ProductionCalendar briefs={[b]} onOpen={vi.fn()} showSoftHoldsByDefault/>);for(const name of ['Concept review','Location confirmed','Signed paperwork due','Brand assets due'])expect(screen.getByText(`Test shoot · ${name}`)).toBeInTheDocument();expect(screen.queryByLabelText('Awaiting shoot dates')).not.toBeInTheDocument()})
 it('routes drag-and-drop files to the named category and rejects mismatched creative formats',async()=>{
  const upload=vi.fn().mockResolvedValue(undefined),b=brief(),pdf=new File(['%PDF-1.7'],'creative.pdf',{type:'application/pdf'})
  expect(validBriefFile(pdf,'creative_brief')).toBe(true);expect(validBriefFile(pdf,'creative_assets')).toBe(false)
  render(<BriefUploads brief={b} editable disabled={false} preview={false} onUpload={upload} onDownload={vi.fn()} onRemove={vi.fn()} onComplete={vi.fn()}/>)
  fireEvent.drop(screen.getByRole('button',{name:'Upload Creative brief (PDF)'}).parentElement!,{dataTransfer:{files:[pdf]}})
  await waitFor(()=>expect(upload).toHaveBeenCalledWith([pdf],'creative_brief'))
  fireEvent.drop(screen.getByRole('button',{name:'Upload Logos, graphics & lower thirds'}).parentElement!,{dataTransfer:{files:[pdf]}})
  expect(screen.getByRole('alert')).toHaveTextContent('Creative briefs require PDF')
  expect(upload).toHaveBeenCalledTimes(1)
 })
 it('creates a standalone idea through the persistent API',async()=>{
  const user=userEvent.setup(),api={ideas:vi.fn().mockResolvedValue({items:[],nextCursor:null}),createIdea:vi.fn().mockResolvedValue({})}
  render(<IdeaBoard api={api as never} access={{userId:'author',canReview:false,canAdminister:false,isExecutive:false,notificationsConfigured:false}} clients={[]} onBrief={vi.fn()}/>)
  await user.click(screen.getByRole('button',{name:'+ New idea'}));await user.type(screen.getByLabelText('Idea title'),'Campus interviews');await user.type(screen.getByLabelText('Creative pitch'),'Short stories from students at work.');await user.click(screen.getByRole('button',{name:'Save idea'}))
  await waitFor(()=>expect(api.createIdea).toHaveBeenCalledWith(expect.objectContaining({title:'Campus interviews',pitch:'Short stories from students at work.',id:expect.any(String)})))
 })
})
