import {cleanup,render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import LiveReservations from './Reservations'
const m=vi.hoisted(()=>({clients:vi.fn(),inventory:vi.fn(),reservations:vi.fn(),settings:vi.fn(),availability:vi.fn(),create:vi.fn(),edit:vi.fn(),cancel:vi.fn(),api:{} as Record<string,unknown>}))
m.api={production:()=>({clients:m.clients}),inventory:m.inventory,reservations:m.reservations,accounts:()=>({settings:m.settings}),equipment:()=>({availability:m.availability,edit:m.edit}),createReservation:m.create,cancelReservation:m.cancel}
vi.mock('./live',async()=>({...await vi.importActual('./live'),useLiveOrganization:()=>({api:m.api,organization:{id:'org'},admin:false})}))
const start=new Date(Date.now()+86400000).toISOString(),end=new Date(Date.now()+90000000).toISOString(),item={id:'camera',name:'Live camera',equipmentCode:'CAM-1',category:'Camera & Accessories',status:'available',condition:'good',version:1,checkedOut:false,photoId:null},reservation={id:'booking',userId:'user',name:'Booked shoot',startsAt:start,endsAt:end,status:'confirmed',fulfillmentStatus:'reserved',version:1,equipmentIds:['camera'],checkedOutAt:null,returnedAt:null}
beforeEach(()=>{vi.clearAllMocks();m.clients.mockResolvedValue({items:[],nextCursor:null});m.settings.mockResolvedValue({reservationDays:7});m.inventory.mockResolvedValue({items:[item],nextCursor:null});m.reservations.mockResolvedValue({items:[reservation],nextCursor:null});m.availability.mockResolvedValue({items:[],nextCursor:null});m.create.mockResolvedValue({...reservation,id:'created'});m.edit.mockResolvedValue({...reservation,name:'Updated shoot',version:2})})
afterEach(cleanup)
describe('Authenticated equipment reservations',()=>{
 it('shows a leadership-visible booking without editing or cancellation controls',async()=>{
  m.reservations.mockResolvedValue({items:[{...reservation,readOnly:true}],nextCursor:null})
  const user=userEvent.setup();render(<LiveReservations/>);await user.click(await screen.findByRole('button',{name:'Booked shoot'}))
  expect(screen.getByText('Live camera')).toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'Edit / extend reservation'})).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'Cancel reservation'})).not.toBeInTheDocument()
  expect(screen.queryByRole('link',{name:'Checkout / return'})).not.toBeInTheDocument()
 })

 it('creates a booking with persistent equipment IDs and a request ID',async()=>{const user=userEvent.setup();render(<LiveReservations create/>);await user.type(await screen.findByLabelText('Reservation name'),'Campaign shoot');await user.click(screen.getByRole('checkbox',{name:/Live camera/}));const submit=screen.getByRole('button',{name:'Create reservation'});await waitFor(()=>expect(submit).toBeEnabled());await user.click(submit);await waitFor(()=>expect(m.create).toHaveBeenCalledWith('org',expect.objectContaining({name:'Campaign shoot',equipmentIds:['camera'],requestId:expect.any(String)})))})
 it('edits a real booking using its current version',async()=>{const user=userEvent.setup();render(<LiveReservations/>);await user.click(await screen.findByRole('button',{name:'Booked shoot'}));await user.click(screen.getByRole('button',{name:'Edit / extend reservation'}));await user.clear(screen.getByLabelText('Reservation name'));await user.type(screen.getByLabelText('Reservation name'),'Updated shoot');const submit=screen.getByRole('button',{name:'Save reservation'});await waitFor(()=>expect(submit).toBeEnabled());await user.click(submit);await waitFor(()=>expect(m.edit).toHaveBeenCalledWith('booking',expect.objectContaining({name:'Updated shoot',version:1,requestId:expect.any(String)})))})
 it('marks conflicting gear unavailable before submission',async()=>{m.availability.mockResolvedValue({items:[{id:'other',equipmentIds:['camera'],startsAt:start,endsAt:end}],nextCursor:null});render(<LiveReservations create/>);await screen.findByLabelText('Reservation name');await waitFor(()=>expect(screen.getByRole('checkbox',{name:/Live camera/})).toBeDisabled());expect(m.create).not.toHaveBeenCalled()})
 it('does not substitute preview bookings after a service failure',async()=>{m.reservations.mockRejectedValue(new Error('private detail'));render(<LiveReservations/>);expect(await screen.findByRole('alert')).toHaveTextContent('service is unavailable');expect(screen.queryByRole('button',{name:'Booked shoot'})).not.toBeInTheDocument()})
})
