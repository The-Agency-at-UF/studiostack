import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import LiveReservations from './Reservations'
const m=vi.hoisted(()=>({clients:vi.fn(),inventory:vi.fn(),reservations:vi.fn(),settings:vi.fn(),availability:vi.fn(),create:vi.fn(),edit:vi.fn(),cancel:vi.fn(),createEquipment:vi.fn(),access:vi.fn(),createClient:vi.fn(),admin:false,api:{} as Record<string,unknown>}))
m.api={production:()=>({clients:m.clients,access:m.access,createClient:m.createClient}),inventory:m.inventory,reservations:m.reservations,accounts:()=>({settings:m.settings}),equipment:()=>({availability:m.availability,edit:m.edit}),createReservation:m.create,cancelReservation:m.cancel,createEquipment:m.createEquipment}
vi.mock('./live',async()=>({...await vi.importActual('./live'),useLiveOrganization:()=>({api:m.api,organization:{id:'org'},admin:m.admin})}))
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn(),replace:vi.fn()})}))
const start=new Date(Date.now()+86400000).toISOString(),end=new Date(Date.now()+90000000).toISOString(),item={id:'camera',name:'Live camera',equipmentCode:'CAM-1',category:'Camera & Accessories',status:'available',condition:'good',version:1,checkedOut:false,photoId:null},reservation={id:'booking',userId:'user',name:'Booked shoot',startsAt:start,endsAt:end,status:'confirmed',fulfillmentStatus:'reserved',version:1,equipmentIds:['camera'],checkedOutAt:null,returnedAt:null}
beforeEach(()=>{vi.clearAllMocks();m.admin=false;m.createEquipment.mockResolvedValue({...item,id:'tripod',name:'Tripod',equipmentCode:'CAM-AAAA'});m.clients.mockResolvedValue({items:[],nextCursor:null});m.access.mockResolvedValue({userId:'user',canReview:false,canAdminister:false,isExecutive:false,notificationsConfigured:true});m.createClient.mockResolvedValue({id:'client-new',name:'Southside Coffee Co.',version:1,createdBy:'user',deletedAt:null});m.settings.mockResolvedValue({reservationDays:7});m.inventory.mockResolvedValue({items:[item],nextCursor:null});m.reservations.mockResolvedValue({items:[reservation],nextCursor:null});m.availability.mockResolvedValue({items:[],nextCursor:null});m.create.mockResolvedValue({...reservation,id:'created'});m.edit.mockResolvedValue({...reservation,name:'Updated shoot',version:2})})
afterEach(()=>{cleanup();window.history.replaceState(null,'','/reservations/')})
type User=ReturnType<typeof userEvent.setup>
/** Moves the booking flow forward one question once the current one is answered. */
async function next(user:User){const button=await screen.findByRole('button',{name:'Continue'});await waitFor(()=>expect(button).toBeEnabled());await user.click(button)}
async function openBooking(user:User){await user.click(await screen.findByRole('button',{name:/Booked shoot/}))}

describe('Reservation list and booking page',()=>{
 it('lists upcoming bookings by day and opens the booking page',async()=>{const user=userEvent.setup();render(<LiveReservations/>);expect(await screen.findByRole('tab',{name:/Upcoming/})).toHaveAttribute('aria-selected','true');expect(screen.getByText(/^Tomorrow/)).toBeInTheDocument();await openBooking(user);expect(screen.getByRole('heading',{name:'Booked shoot'})).toBeInTheDocument();expect(screen.getByText('Live camera')).toBeInTheDocument();expect(screen.getByRole('link',{name:'Check out'})).toHaveAttribute('href',expect.stringContaining('reservation=booking'))})
 it('shows a leadership-visible booking without editing or cancellation controls',async()=>{
  m.reservations.mockResolvedValue({items:[{...reservation,readOnly:true}],nextCursor:null})
  const user=userEvent.setup();render(<LiveReservations/>);await openBooking(user)
  expect(screen.getByText('Live camera')).toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'Edit reservation'})).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'Cancel reservation'})).not.toBeInTheDocument()
  expect(screen.queryByRole('link',{name:'Check out'})).not.toBeInTheDocument()
 })
 it('calls out an overdue checkout above the list',async()=>{m.reservations.mockResolvedValue({items:[{...reservation,fulfillmentStatus:'checked_out',startsAt:new Date(Date.now()-7200000).toISOString(),endsAt:new Date(Date.now()-3600000).toISOString()}],nextCursor:null});const user=userEvent.setup();render(<LiveReservations/>);expect(await screen.findByText(/is overdue/)).toBeInTheDocument();await user.click(screen.getByRole('button',{name:'Review'}));expect(screen.getByRole('link',{name:'Return equipment'})).toBeInTheDocument();expect(screen.getAllByText('Overdue').length).toBeGreaterThan(0)})
 it('combines the visible equipment and client filters with search and clears all three',async()=>{
  m.clients.mockResolvedValue({items:[{id:'studio',name:'Bloom Studio'}],nextCursor:null})
  m.inventory.mockResolvedValue({items:[item,{...item,id:'tripod',name:'Tripod',equipmentCode:'CAM-2'}],nextCursor:null})
  m.reservations.mockResolvedValue({items:[
   {...reservation,clientAccountId:'studio'},
   {...reservation,id:'tripod-booking',name:'Tripod shoot',clientAccountId:'studio',equipmentIds:['tripod']},
   {...reservation,id:'internal-booking',name:'Internal shoot'}
  ],nextCursor:null})
  const user=userEvent.setup();render(<LiveReservations/>);await screen.findByRole('button',{name:/Tripod shoot/})
  const equipment=screen.getByRole('combobox',{name:'Equipment'})
  const client=screen.getByRole('combobox',{name:'Client account'})
  const search=screen.getByRole('searchbox',{name:'Search'})
  await user.selectOptions(equipment,'camera')
  expect(screen.queryByRole('button',{name:/Tripod shoot/})).not.toBeInTheDocument()
  await user.selectOptions(client,'studio')
  expect(screen.queryByRole('button',{name:/Internal shoot/})).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:/Booked shoot/})).toBeInTheDocument()
  await user.type(search,'no match')
  expect(screen.getByRole('heading',{name:'No matching reservations'})).toBeInTheDocument()
  await user.click(screen.getByRole('button',{name:'Clear filters'}))
  expect(equipment).toHaveValue('')
  expect(client).toHaveValue('')
  expect(search).toHaveValue('')
  expect(screen.getByRole('button',{name:/Tripod shoot/})).toBeInTheDocument()
  expect(screen.getByRole('button',{name:/Internal shoot/})).toBeInTheDocument()
 })
 it('shows an empty state for a new organization',async()=>{m.reservations.mockResolvedValue({items:[],nextCursor:null});render(<LiveReservations/>);expect(await screen.findByRole('heading',{name:'No reservations yet'})).toBeInTheDocument()})
 it('does not substitute preview bookings after a service failure',async()=>{m.reservations.mockRejectedValue(new Error('private detail'));render(<LiveReservations/>);expect(await screen.findByRole('alert')).toHaveTextContent(/temporarily unavailable|couldn’t load|couldn’t be saved|didn’t respond/);expect(screen.queryByRole('button',{name:/Booked shoot/})).not.toBeInTheDocument()})
})

describe('Booking flow',()=>{
 it('creates a booking with persistent equipment IDs and a request ID',async()=>{const user=userEvent.setup();render(<LiveReservations create/>);await next(user);await user.click(await screen.findByRole('checkbox',{name:/Live camera/}));await next(user);await user.type(screen.getByLabelText('Reservation name'),'Campaign shoot');const submit=screen.getByRole('button',{name:'Create reservation'});await waitFor(()=>expect(submit).toBeEnabled());await user.click(submit);await waitFor(()=>expect(m.create).toHaveBeenCalledWith('org',expect.objectContaining({name:'Campaign shoot',equipmentIds:['camera'],requestId:expect.any(String)})));expect(await screen.findByText('Reservation created.')).toBeInTheDocument()})
 it('needs equipment before the details step',async()=>{const user=userEvent.setup();render(<LiveReservations create/>);await next(user);await screen.findByRole('checkbox',{name:/Live camera/});expect(screen.getByRole('button',{name:'Continue'})).toBeDisabled();expect(screen.getByText('Pick at least one item')).toBeInTheDocument()})
 it('edits a real booking using its current version',async()=>{const user=userEvent.setup();render(<LiveReservations/>);await openBooking(user);await user.click(screen.getByRole('button',{name:'Edit reservation'}));await next(user);await next(user);await user.clear(screen.getByLabelText('Reservation name'));await user.type(screen.getByLabelText('Reservation name'),'Updated shoot');const submit=screen.getByRole('button',{name:'Save reservation'});await waitFor(()=>expect(submit).toBeEnabled());await user.click(submit);await waitFor(()=>expect(m.edit).toHaveBeenCalledWith('booking',expect.objectContaining({name:'Updated shoot',version:1,requestId:expect.any(String)})))})
 it('moves the return with the pickup so a later pickup stays bookable',async()=>{render(<LiveReservations create/>);const starts=await screen.findByLabelText('Pick up') as HTMLInputElement,ends=screen.getByLabelText('Return') as HTMLInputElement,length=Date.parse(ends.value)-Date.parse(starts.value),later=new Date(Date.parse(starts.value)+86400000),text=new Date(later.getTime()-later.getTimezoneOffset()*60000).toISOString().slice(0,16);fireEvent.change(starts,{target:{value:text}});expect(Date.parse(ends.value)-Date.parse(text)).toBe(length);expect(screen.queryByText(/Choose a return time after pickup/)).not.toBeInTheDocument()})
 it('sets the return from a quick length',async()=>{const user=userEvent.setup();render(<LiveReservations create/>);const starts=await screen.findByLabelText('Pick up') as HTMLInputElement,ends=screen.getByLabelText('Return') as HTMLInputElement;await user.click(screen.getByRole('button',{name:'Full day'}));expect(Date.parse(ends.value)-Date.parse(starts.value)).toBe(86400000);expect(screen.getByRole('button',{name:'Full day'})).toHaveAttribute('aria-pressed','true')})
 it('lets an admin add equipment inside the booking and reserve it',async()=>{m.admin=true;m.inventory.mockResolvedValue({items:[],nextCursor:null});const user=userEvent.setup();render(<LiveReservations create/>);await next(user);await user.type(await screen.findByLabelText('Equipment name'),'Tripod{Enter}');await waitFor(()=>expect(m.createEquipment).toHaveBeenCalledWith('org',{equipmentCode:expect.stringMatching(/^CAM-[A-HJ-NP-Z2-9]{4}$/),name:'Tripod',category:'Camera & Accessories'}));expect(m.create).not.toHaveBeenCalled();expect(await screen.findByRole('checkbox',{name:/Tripod/})).toBeChecked();await next(user);await user.type(screen.getByLabelText('Reservation name'),'Campaign shoot');const submit=screen.getByRole('button',{name:'Create reservation'});await waitFor(()=>expect(submit).toBeEnabled());await user.click(submit);await waitFor(()=>expect(m.create).toHaveBeenCalledWith('org',expect.objectContaining({equipmentIds:['tripod']})))})
 it('keeps quick add behind a link once equipment exists',async()=>{m.admin=true;const user=userEvent.setup();render(<LiveReservations create/>);await next(user);await screen.findByRole('checkbox',{name:/Live camera/});expect(screen.queryByLabelText('Equipment name')).not.toBeInTheDocument();await user.click(screen.getByRole('button',{name:'Can’t find it? Add equipment'}));expect(screen.getByLabelText('Equipment name')).toBeInTheDocument()})
 it('shows a failed equipment add without losing the booking',async()=>{m.admin=true;m.inventory.mockResolvedValue({items:[],nextCursor:null});m.createEquipment.mockRejectedValue(new Error('private'));const user=userEvent.setup();render(<LiveReservations create/>);const starts=await screen.findByLabelText('Pick up') as HTMLInputElement,picked=starts.value;await next(user);await user.type(screen.getByLabelText('Equipment name'),'Tripod');await user.click(screen.getByRole('button',{name:'Add and select'}));expect(await screen.findByRole('alert')).toHaveTextContent(/temporarily unavailable|couldn’t load|couldn’t be saved|didn’t respond/);expect(screen.getByLabelText('Equipment name')).toHaveValue('Tripod');await user.click(screen.getByRole('button',{name:'Back'}));expect(screen.getByLabelText('Pick up')).toHaveValue(picked)})
 it('returns to equipment with fresh availability when someone books an item first (409)',async()=>{
  const {DatabaseApiClientError}=await import('../../api/database')
  m.create.mockRejectedValueOnce(new DatabaseApiClientError(409,'Conflict'))
  const user=userEvent.setup();render(<LiveReservations create/>);await next(user);await user.click(await screen.findByRole('checkbox',{name:/Live camera/}));await next(user)
  await user.type(screen.getByLabelText('Reservation name'),'Campaign shoot')
  const checks=m.availability.mock.calls.length
  m.availability.mockResolvedValue({items:[{id:'other',equipmentIds:['camera'],startsAt:start,endsAt:end}],nextCursor:null})
  const submit=screen.getByRole('button',{name:'Create reservation'});await waitFor(()=>expect(submit).toBeEnabled());await user.click(submit)
  expect(await screen.findByText(/just booked by someone else/)).toBeInTheDocument()
  expect(screen.getByRole('heading',{name:'What are you taking?'})).toBeInTheDocument()
  await waitFor(()=>expect(m.availability.mock.calls.length).toBeGreaterThan(checks))
  expect(await screen.findByText('Selected equipment is unavailable. Choose another item or go back and change the dates.')).toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Continue'})).toBeDisabled()
 })
 it('caps a reservation at 50 items like the server',async()=>{
  m.inventory.mockResolvedValue({items:Array.from({length:52},(_,i)=>({...item,id:`item-${i}`,name:`Item ${i}`,equipmentCode:`CAM-${i}`})),nextCursor:null})
  const user=userEvent.setup();render(<LiveReservations create/>);await next(user);await screen.findByRole('checkbox',{name:/^Item 0/})
  for(let i=0;i<50;i++)fireEvent.click(screen.getByRole('checkbox',{name:new RegExp(`^Item ${i}\\b`)}))
  expect(screen.getByText('50 of 50 items selected')).toBeInTheDocument()
  expect(screen.getByRole('checkbox',{name:/^Item 51\b/})).toBeDisabled()
 })
 it('folds conflicting gear away and keeps it unselectable',async()=>{m.availability.mockResolvedValue({items:[{id:'other',equipmentIds:['camera'],startsAt:start,endsAt:end}],nextCursor:null});const user=userEvent.setup();render(<LiveReservations create/>);await next(user);const fold=await screen.findByRole('button',{name:/Not available for these dates \(1\)/});expect(screen.queryByRole('checkbox',{name:/Live camera/})).not.toBeInTheDocument();await user.click(fold);expect(screen.getByRole('checkbox',{name:/Live camera/})).toBeDisabled();expect(m.create).not.toHaveBeenCalled()})
})

describe('Client accounts in the booking flow',()=>{
 async function toDetails(user:User){await next(user);await user.click(await screen.findByRole('checkbox',{name:/Live camera/}));await next(user)}
 it('lets production leadership add a client account and books it',async()=>{m.access.mockResolvedValue({userId:'user',canReview:true,canAdminister:false,isExecutive:false,notificationsConfigured:true});const user=userEvent.setup();render(<LiveReservations create/>);await toDetails(user);await user.type(screen.getByLabelText('Reservation name'),'Product shoot');await user.selectOptions(screen.getByLabelText('Client account'),'+ Add a new client account…');await user.click(screen.getByRole('button',{name:'Add client account'}));expect(screen.getByRole('alert')).toHaveTextContent('Enter a name');await user.type(screen.getByLabelText('New client account'),'Southside Coffee Co.{Enter}');await waitFor(()=>expect(m.createClient).toHaveBeenCalledWith('Southside Coffee Co.'));expect(m.create).not.toHaveBeenCalled();expect(screen.getByLabelText('Client account')).toHaveDisplayValue('Southside Coffee Co.');expect(screen.queryByLabelText('New client account')).not.toBeInTheDocument();await user.click(screen.getByRole('button',{name:'Create reservation'}));await waitFor(()=>expect(m.create).toHaveBeenCalledWith('org',expect.objectContaining({clientAccountId:'client-new'})))})
 it('keeps the typed name when adding a client account fails',async()=>{m.access.mockResolvedValue({userId:'user',canReview:true,canAdminister:true,isExecutive:false,notificationsConfigured:true});m.createClient.mockRejectedValue(new Error('private'));const user=userEvent.setup();render(<LiveReservations create/>);await toDetails(user);await user.selectOptions(screen.getByLabelText('Client account'),'+ Add a new client account…');await user.type(screen.getByLabelText('New client account'),'Bloom Studio');await user.click(screen.getByRole('button',{name:'Add client account'}));expect(await screen.findByRole('alert')).toHaveTextContent(/temporarily unavailable|couldn’t load|couldn’t be saved|didn’t respond/);expect(screen.getByLabelText('New client account')).toHaveValue('Bloom Studio')})
 it('does not offer to add client accounts to other members',async()=>{const user=userEvent.setup();render(<LiveReservations create/>);await toDetails(user);expect(screen.queryByRole('option',{name:'+ Add a new client account…'})).not.toBeInTheDocument()})
})

describe('Optimistic reservation cancel',()=>{
 function deferred(){let resolve!:(v:unknown)=>void,reject!:(e:unknown)=>void;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
 it('shows the booking as cancelled before the server confirms it',async()=>{const d=deferred();m.cancel.mockReturnValue(d.promise);const user=userEvent.setup();render(<LiveReservations/>);await openBooking(user);await user.click(screen.getByRole('button',{name:'Cancel reservation'}));await user.click(within(screen.getByRole('dialog',{name:'Cancel this reservation?'})).getByRole('button',{name:'Cancel reservation'}));expect(m.cancel).toHaveBeenCalledWith('org','booking',1);expect(screen.getByText('Cancelled')).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Cancel reservation'})).not.toBeInTheDocument();m.reservations.mockResolvedValue({items:[{...reservation,status:'cancelled',version:2}],nextCursor:null});d.resolve({...reservation,status:'cancelled',version:2});expect(await screen.findByText('Reservation cancelled.')).toBeInTheDocument();expect(screen.getByText('Cancelled')).toBeInTheDocument()})
 it('asks before cancelling, names the booking and keeps it when declined',async()=>{const user=userEvent.setup();render(<LiveReservations/>);await openBooking(user);await user.click(screen.getByRole('button',{name:'Cancel reservation'}));const dialog=screen.getByRole('dialog',{name:'Cancel this reservation?'});expect(dialog).toHaveAccessibleDescription(/can’t be undone/);await user.click(within(dialog).getByRole('button',{name:'Keep reservation'}));expect(m.cancel).not.toHaveBeenCalled();await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());expect(screen.getByRole('button',{name:'Cancel reservation'})).toBeEnabled()})
 it('restores the booking and explains the failure when cancelling fails',async()=>{const d=deferred();m.cancel.mockReturnValue(d.promise);const user=userEvent.setup();render(<LiveReservations/>);await openBooking(user);await user.click(screen.getByRole('button',{name:'Cancel reservation'}));await user.click(within(screen.getByRole('dialog',{name:'Cancel this reservation?'})).getByRole('button',{name:'Cancel reservation'}));expect(screen.getByText('Cancelled')).toBeInTheDocument();d.reject(new Error('private detail'));expect(await screen.findByRole('alert')).toHaveTextContent(/temporarily unavailable|couldn’t load|couldn’t be saved|didn’t respond/);expect(screen.queryByText('Cancelled')).not.toBeInTheDocument();expect(screen.getAllByText('Reserved').length).toBeGreaterThan(0);expect(screen.getByRole('button',{name:'Cancel reservation'})).toBeEnabled();expect(screen.queryByText('Reservation cancelled.')).not.toBeInTheDocument()})
})

it('LOGIC-020: keeps the exact saved timestamps during a name-only edit',async()=>{
 const saved={...reservation,startsAt:new Date(Date.now()+86400000).toISOString().replace(/:\d{2}\.\d{3}Z$/,':25.123Z'),endsAt:new Date(Date.now()+90000000).toISOString().replace(/:\d{2}\.\d{3}Z$/,':27.456Z')}
 m.reservations.mockResolvedValue({items:[saved],nextCursor:null})
 const user=userEvent.setup()
 render(<LiveReservations/>)
 await openBooking(user)
 await user.click(screen.getByRole('button',{name:'Edit reservation'}))
 await next(user)
 await next(user)
 const name=screen.getByLabelText('Reservation name')
 await user.clear(name)
 await user.type(name,'Updated shoot')
 await user.click(screen.getByRole('button',{name:'Save reservation'}))
 await waitFor(()=>expect(m.edit).toHaveBeenCalledWith(saved.id,expect.objectContaining({startsAt:saved.startsAt,endsAt:saved.endsAt})))
})
