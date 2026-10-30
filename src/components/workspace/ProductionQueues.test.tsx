import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import ProductionQueues from './ProductionQueues'
import {emptyBrief,type ProductionBrief} from '../../types/production'
const m=vi.hoisted(()=>({session:{} as Record<string,unknown>,access:vi.fn(),list:vi.fn(),token:vi.fn()}))
vi.mock('../../context/AppSessionContext',()=>({useAppSession:()=>m.session}))
vi.mock('../../auth/cognito',()=>({authConfiguration:()=>({apiUrl:'https://example.test'})}))
vi.mock('../../api/database',async()=>({...await vi.importActual('../../api/database'),createDatabaseApiClient:()=>({production:()=>({access:m.access,list:m.list})})}))
const future=new Date(Date.now()+7*86400_000).toISOString().slice(0,10)
const access={userId:'author',canReview:false,canAdminister:false,isExecutive:false,notificationsConfigured:true}
function brief(id:string,status:ProductionBrief['status'],ownerId='author'):ProductionBrief{return {id,organizationId:'org',ownerId,ownerName:ownerId,status,version:1,submission:1,data:{...emptyBrief(),projectName:id,client:'Agency client',productionTypes:['Videography'],fields:{proposedStart:future,proposedEnd:future}},shootStartsAt:null,shootEndsAt:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),events:[],attachments:[]}}
const queue=(name:string)=>within(screen.getByRole('heading',{name}).closest('section')!)
beforeEach(()=>{vi.clearAllMocks();m.session={email:'author@example.test',mode:'authenticated',getAccessToken:m.token,organizations:[{id:'org'}],selectedOrganizationId:'org'};m.access.mockResolvedValue(access);m.list.mockResolvedValue({items:[],nextCursor:null})})
afterEach(cleanup)
describe('Production home queues',()=>{
 it('shows the author’s actionable briefs and labeled tentative shoots with existing deep links',async()=>{
  m.list.mockResolvedValue({items:[brief('Own draft','draft'),brief('Fix feedback','changes_requested'),brief('Another draft','draft','other'),brief('Review request','submitted','other')],nextCursor:null})
  render(<ProductionQueues/>);await screen.findByRole('heading',{name:'Briefs needing attention'})
  expect(queue('Briefs needing attention').getByRole('link',{name:'Own draft'})).toHaveAttribute('href','/production?organization=org&brief=Own%20draft')
  expect(queue('Briefs needing attention').queryByText('Another draft')).not.toBeInTheDocument()
  expect(queue('Briefs needing attention').queryByText('Review request')).not.toBeInTheDocument()
  expect(queue('Upcoming productions').getAllByText(/Tentative shoot/)).toHaveLength(2)
 })
 it('shows pending reviews to reviewers, excludes denied and withdrawn shoots, and reads every list page',async()=>{
  m.access.mockResolvedValue({...access,canReview:true});m.list.mockResolvedValueOnce({items:[brief('Ready for review','submitted','other')],nextCursor:'next'}).mockResolvedValueOnce({items:[brief('Denied request','denied'),brief('Withdrawn request','withdrawn')],nextCursor:null})
  render(<ProductionQueues/>);await screen.findByRole('heading',{name:'Briefs needing attention'})
  expect(queue('Briefs needing attention').getByText('Ready for review')).toBeInTheDocument()
  expect(queue('Upcoming productions').queryByText('Denied request')).not.toBeInTheDocument()
  expect(m.list).toHaveBeenCalledWith('next')
 })
 it('reports failed reads without claiming an empty queue and retries in place',async()=>{
  m.list.mockRejectedValueOnce(new Error('offline'));render(<ProductionQueues/>)
  expect(await screen.findByRole('alert')).toHaveTextContent('service is unavailable')
  expect(screen.queryByText('No briefs need your attention.')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Retry production'}))
  expect(await screen.findByText('No briefs need your attention.')).toBeInTheDocument()
 })
 it('isolates organization changes from an earlier pending response',async()=>{
  let resolveOld!:(value:unknown)=>void
  m.list.mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve})).mockResolvedValue({items:[brief('New workspace','submitted')],nextCursor:null})
  const view=render(<ProductionQueues/>);await waitFor(()=>expect(m.list).toHaveBeenCalledOnce())
  m.session={...m.session,organizations:[{id:'new-org'}],selectedOrganizationId:'new-org'};view.rerender(<ProductionQueues/>)
  expect(await screen.findByRole('link',{name:'New workspace'})).toHaveAttribute('href','/production?organization=new-org&brief=New%20workspace')
  resolveOld({items:[brief('Old workspace','submitted')],nextCursor:null})
  await waitFor(()=>expect(screen.queryByText('Old workspace')).not.toBeInTheDocument())
 })
})

it('uses exclusive confirmed ends and inclusive tentative windows in the upcoming queue',async()=>{
  const today=new Date().toISOString().slice(0,10),yesterday=new Date(Date.now()-86400_000).toISOString().slice(0,10)
  const finished={...brief('Finished shoot','approved'),shootStartsAt:yesterday+'T00:00:00.000Z',shootEndsAt:today+'T00:00:00.000Z'}
  const tentative=brief('Today tentative','submitted');tentative.data.fields={proposedStart:today,proposedEnd:today}
  m.list.mockResolvedValue({items:[finished,tentative],nextCursor:null});render(<ProductionQueues/>);
  await screen.findByRole('heading',{name:'Upcoming productions'});
  expect(queue('Upcoming productions').queryByText('Finished shoot')).not.toBeInTheDocument();
  expect(queue('Upcoming productions').getByText('Today tentative')).toBeInTheDocument();
})
