import {cleanup,render,screen,within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import OrganizationDirectory from './OrganizationDirectory'
import {AppSessionProvider} from '../../context/AppSessionContext'
const m=vi.hoisted(()=>({settings:vi.fn(),members:vi.fn(),invitations:vi.fn(),directory:vi.fn()}))
vi.mock('../../api/database',()=>({createDatabaseApiClient:()=>({accounts:()=>m}),DatabaseApiClientError:class extends Error{constructor(public status:number){super()}}}))
vi.mock('../../auth/cognito',()=>({authConfiguration:()=>({apiUrl:'https://api.example.test'})}))
const settings={id:'org',name:'The Agency at UF',slug:'agency',role:'owner',reservationDays:14,version:1}
const future=new Date(Date.now()+86400000).toISOString()
function view(){render(<AppSessionProvider value={{email:'person@example.test',isAdmin:true,setEmail:vi.fn(),setIsAdmin:vi.fn(),mode:'authenticated',getAccessToken:async()=>'token',selectedOrganizationId:'org'}}><OrganizationDirectory/></AppSessionProvider>)}
beforeEach(()=>{vi.clearAllMocks();m.settings.mockResolvedValue(settings)
  m.members.mockResolvedValue({items:[
    {id:'a',displayName:'Sam Ellis',email:'sam@example.test',role:'admin',status:'active',version:1},
    {id:'o',displayName:'Morgan Lee',email:'morgan@example.test',role:'owner',status:'active',version:1},
    {id:'m1',displayName:'Alex Rivera',email:'alex@example.test',role:'member',status:'active',version:1},
    {id:'m2',displayName:'Casey Brooks',email:'casey@example.test',role:'member',status:'suspended',version:1},
    {id:'m3',displayName:'Taylor Chen',email:'taylor@example.test',role:'member',status:'invited',version:1},
  ],nextCursor:null})
  m.invitations.mockResolvedValue({items:[{id:'i',email:'taylor@example.test',displayName:'Taylor Chen',role:'member',status:'pending',deliveryStatus:'sent',attempts:1,expiresAt:future,version:1,createdAt:future}],nextCursor:null})
  m.directory.mockResolvedValue({items:[{id:'o',displayName:'Morgan Lee',role:'owner'},{id:'m1',displayName:'Alex Rivera',role:'member'}],nextCursor:null})})
afterEach(cleanup)
describe('Organization directory',()=>{
  it('groups owners and admins above members, owners first, with management details for admins',async()=>{
    view()
    const admins=await screen.findByRole('region',{name:'Admin'})
    expect(within(admins).getAllByRole('listitem').map(li=>li.querySelector('strong')?.textContent)).toEqual(['Morgan Lee','Sam Ellis'])
    expect(within(admins).getByText('Owner')).toBeInTheDocument()
    const members=screen.getByRole('region',{name:'Members'})
    expect(within(members).getByText('alex@example.test')).toBeInTheDocument()
    expect(within(within(members).getByRole('list')).getByText('Suspended')).toBeInTheDocument()
    expect(within(members).queryByText('Taylor Chen')).not.toBeInTheDocument()
    expect(within(screen.getByRole('region',{name:'Pending invitations'})).getByText('Taylor Chen')).toBeInTheDocument()
    expect(screen.getByRole('link',{name:'Invite or manage people'})).toHaveAttribute('href','/organization/settings')
    expect(m.directory).not.toHaveBeenCalled()
  })
  it('filters members by search and status',async()=>{
    const user=userEvent.setup();view()
    const members=await screen.findByRole('region',{name:'Members'})
    await user.selectOptions(screen.getByLabelText('Filter by status'),'suspended')
    expect(within(members).queryByText('Alex Rivera')).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Filter by status'),'all')
    await user.type(screen.getByLabelText('Search members'),'alex@')
    expect(within(members).getByText('Alex Rivera')).toBeInTheDocument()
    expect(within(members).queryByText('Casey Brooks')).not.toBeInTheDocument()
  })
  it('shows members a read-only, names-only directory',async()=>{
    m.settings.mockResolvedValue({...settings,role:'member'});view()
    expect(await screen.findByText("You're a member")).toBeInTheDocument()
    expect(within(screen.getByRole('region',{name:'Admin'})).getByText('Morgan Lee')).toBeInTheDocument()
    expect(within(screen.getByRole('region',{name:'Members'})).getByText('Alex Rivera')).toBeInTheDocument()
    expect(m.members).not.toHaveBeenCalled();expect(m.invitations).not.toHaveBeenCalled()
    expect(screen.queryByText(/@example\.test/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Filter by status')).not.toBeInTheDocument()
    expect(screen.queryByRole('region',{name:'Pending invitations'})).not.toBeInTheDocument()
    expect(screen.queryByRole('link',{name:/manage/i})).not.toBeInTheDocument()
  })
  it('reports a failed read without showing a partial directory',async()=>{
    m.members.mockRejectedValue(new Error('private details'));view()
    expect(await screen.findByRole('alert')).toHaveTextContent('directory is unavailable')
    expect(screen.queryByRole('region',{name:'Admin'})).not.toBeInTheDocument()
    expect(screen.queryByText('private details')).not.toBeInTheDocument()
  })
})
