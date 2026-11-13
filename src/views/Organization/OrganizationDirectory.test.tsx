import {cleanup,render,screen,waitFor,within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import OrganizationDirectory from './OrganizationDirectory'
import {AppSessionProvider} from '../../context/AppSessionContext'
import {DatabaseApiClientError} from '../../api/database'
const m=vi.hoisted(()=>({settings:vi.fn(),members:vi.fn(),invitations:vi.fn(),directory:vi.fn(),joinCodes:vi.fn(),updateMember:vi.fn(),invite:vi.fn()}))
vi.mock('../../api/database',()=>({createDatabaseApiClient:()=>({accounts:()=>m}),DatabaseApiClientError:class extends Error{constructor(public status:number){super()}}}))
vi.mock('../../auth/cognito',()=>({authConfiguration:()=>({apiUrl:'https://api.example.test'})}))
const settings={id:'org',name:'The Agency at UF',slug:'agency',role:'owner',reservationDays:14,version:1}
const future=new Date(Date.now()+86400000).toISOString()
function view(){render(<AppSessionProvider value={{email:'Morgan@example.test',isAdmin:true,setEmail:vi.fn(),setIsAdmin:vi.fn(),mode:'authenticated',getAccessToken:async()=>'token',selectedOrganizationId:'org'}}><OrganizationDirectory/></AppSessionProvider>)}
beforeEach(()=>{vi.clearAllMocks();m.settings.mockResolvedValue(settings);m.joinCodes.mockResolvedValue({items:[],nextCursor:null});m.updateMember.mockResolvedValue({});m.invite.mockResolvedValue({})
  m.members.mockResolvedValue({items:[
    {id:'a',displayName:'Sam Ellis',email:'sam@example.test',role:'admin',status:'active',version:1},
    {id:'o',displayName:'Morgan Lee',email:'morgan@example.test',role:'owner',status:'active',version:1},
    {id:'o2',displayName:'Jamie Fox',email:'jamie@example.test',role:'owner',status:'active',version:4},
    {id:'m1',displayName:'Alex Rivera',email:'alex@example.test',role:'member',status:'active',version:7},
    {id:'m2',displayName:'Casey Brooks',email:'casey@example.test',role:'member',status:'suspended',version:2},
    {id:'m4',displayName:null,email:'pat@example.test',role:'member',status:'active',version:1},
    {id:'m3',displayName:'Taylor Chen',email:'taylor@example.test',role:'member',status:'invited',version:1},
  ],nextCursor:null})
  m.invitations.mockResolvedValue({items:[{id:'i',email:'taylor@example.test',displayName:'Taylor Chen',role:'member',status:'pending',deliveryStatus:'sent',attempts:1,expiresAt:future,version:1,createdAt:future}],nextCursor:null})
  m.directory.mockResolvedValue({items:[{id:'o',displayName:'Morgan Lee',role:'owner'},{id:'m1',displayName:'Alex Rivera',role:'member'}],nextCursor:null})})
afterEach(cleanup)
function deferred(){let resolve!:(v:unknown)=>void,reject!:(e:unknown)=>void;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
const names=()=>within(screen.getByRole('table')).getAllByRole('row').slice(1).map(row=>row.querySelector('strong')?.firstChild?.textContent)
describe('Organization directory',()=>{
  it('lists everyone in one table, owners then admins then members, with management details for admins',async()=>{
    view()
    const table=await screen.findByRole('table')
    // Casey Brooks was removed, so they are no longer part of the roster.
    expect(names()).toEqual(['Jamie Fox','Morgan Lee','Sam Ellis','Alex Rivera','pat@example.test'])
    expect(within(table).getAllByText('Owner')).toHaveLength(2)
    expect(within(table).getByText('alex@example.test')).toBeInTheDocument()
    expect(within(table).queryByText(/^(Active|Suspended)$/)).not.toBeInTheDocument()
    expect(within(table).queryByRole('columnheader',{name:'Status'})).not.toBeInTheDocument()
    expect(within(table).getByText('No display name yet')).toBeInTheDocument()
    expect(within(table).getByText('(you)')).toBeInTheDocument()
    expect(within(table).queryByText('Taylor Chen')).not.toBeInTheDocument()
    expect(screen.getByText("5 people · 3 admins · You're an owner")).toBeInTheDocument()
    expect(screen.getByRole('link',{name:'1 pending invitation'})).toHaveAttribute('href','/organization/settings#invitations')
    expect(screen.getByRole('link',{name:'People'})).toHaveAttribute('aria-current','page')
    expect(screen.getByRole('link',{name:'Access & settings'})).toHaveAttribute('href','/organization/settings')
    expect(m.directory).not.toHaveBeenCalled()
  })
  it('filters people by search and role, with no status filter',async()=>{
    const user=userEvent.setup();view()
    await screen.findByRole('table')
    expect(screen.queryByLabelText('Filter by status')).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Filter by role'),'admins')
    expect(names()).toEqual(['Jamie Fox','Morgan Lee','Sam Ellis'])
    await user.selectOptions(screen.getByLabelText('Filter by role'),'all')
    await user.type(screen.getByLabelText('Search people'),'alex@')
    expect(names()).toEqual(['Alex Rivera'])
    expect(screen.getByText('Showing 1 of 5')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Search people'),'nobody')
    expect(screen.getByText('No one matches these filters.')).toBeInTheDocument()
  })
  it('changes a role from the People table and reloads the roster',async()=>{
    const user=userEvent.setup();view();await screen.findByRole('table')
    await user.click(screen.getByRole('button',{name:'Manage Alex Rivera'}))
    const panel=screen.getByRole('complementary',{name:'Manage Alex Rivera'})
    expect(within(panel).getByRole('radio',{name:/^Member/})).toBeChecked()
    expect(within(panel).getByRole('button',{name:'Save role'})).toBeDisabled()
    await user.click(within(panel).getByRole('radio',{name:/^Admin/}))
    await user.click(within(panel).getByRole('button',{name:'Save role'}))
    await waitFor(()=>expect(m.updateMember).toHaveBeenCalledWith('m1',{role:'admin',status:'active',version:7,requestId:expect.any(String)}))
    expect(await screen.findByText('Alex Rivera is now an admin.')).toBeInTheDocument()
    expect(m.members).toHaveBeenCalledTimes(2)
  })
  it('opens one person at a time and closes the panel from the button or Escape',async()=>{
    const user=userEvent.setup();view();await screen.findByRole('table')
    await user.click(screen.getByRole('button',{name:'Manage Alex Rivera'}))
    expect(screen.getByRole('heading',{name:'Alex Rivera'})).toHaveFocus()
    await user.click(screen.getByRole('button',{name:'Manage Sam Ellis'}))
    expect(screen.queryByRole('complementary',{name:'Manage Alex Rivera'})).not.toBeInTheDocument()
    expect(screen.getByRole('button',{name:'Manage Sam Ellis'})).toHaveAttribute('aria-expanded','true')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button',{name:'Manage Alex Rivera'}))
    await user.click(screen.getByRole('button',{name:'Close details'}))
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })
  it('confirms before removing someone from the organization',async()=>{
    const user=userEvent.setup();view();await screen.findByRole('table')
    await user.click(screen.getByRole('button',{name:'Manage Sam Ellis'}))
    expect(screen.queryByRole('button',{name:/Suspend|Restore/})).not.toBeInTheDocument()
    await user.click(screen.getByRole('button',{name:'Remove from organization'}))
    expect(screen.getByRole('dialog')).toHaveTextContent('Remove from The Agency at UF?')
    expect(screen.getByRole('dialog')).toHaveTextContent('history are kept')
    await user.click(screen.getByRole('button',{name:'Cancel'}));expect(m.updateMember).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button',{name:'Remove from organization'}))
    await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Remove'}))
    // An admin is removed as a member, so an invitation back starts from the role it offers.
    await waitFor(()=>expect(m.updateMember).toHaveBeenCalledWith('a',{role:'member',status:'suspended',version:1,requestId:expect.any(String)}))
    expect(await screen.findByText('Sam Ellis was removed from The Agency at UF.')).toBeInTheDocument()
  })
  it('trusts the server over a stale account that still holds your email',async()=>{
    m.members.mockResolvedValueOnce({items:[
      {id:'o',displayName:'Roger',email:null,role:'owner',status:'active',version:1,self:true},
      {id:'old',displayName:'Old Morgan',email:'morgan@example.test',role:'owner',status:'active',version:1,self:false},
      {id:'m1',displayName:'Alex Rivera',email:'alex@example.test',role:'member',status:'active',version:7,self:false},
    ],nextCursor:null})
    view();const table=await screen.findByRole('table')
    expect(within(table).getAllByText('(you)')).toHaveLength(1)
    expect(within(within(table).getByText('(you)').closest('tr')!).getByText('Roger')).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'Manage Roger'})).not.toBeInTheDocument()
    expect(screen.getByRole('button',{name:'Manage Old Morgan'})).toBeInTheDocument()
  })
  it('lets owners grant ownership only after confirming, and never manage themselves',async()=>{
    const user=userEvent.setup();view();await screen.findByRole('table')
    expect(screen.queryByRole('button',{name:'Manage Morgan Lee'})).not.toBeInTheDocument()
    await user.click(screen.getByRole('button',{name:'Manage Sam Ellis'}))
    await user.click(screen.getByRole('radio',{name:/^Owner/}))
    await user.click(screen.getByRole('button',{name:'Save role'}))
    expect(m.updateMember).not.toHaveBeenCalled()
    await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Make owner'}))
    await waitFor(()=>expect(m.updateMember).toHaveBeenCalledWith('a',expect.objectContaining({role:'owner',status:'active'})))
  })
  it('keeps admins away from owners and from granting ownership',async()=>{
    m.settings.mockResolvedValue({...settings,role:'admin'});const user=userEvent.setup();view();await screen.findByRole('table')
    expect(screen.queryByRole('button',{name:'Manage Jamie Fox'})).not.toBeInTheDocument()
    await user.click(screen.getByRole('button',{name:'Manage Alex Rivera'}))
    expect(screen.queryByRole('radio',{name:/^Owner/})).not.toBeInTheDocument()
    expect(screen.getByRole('radio',{name:/^Admin/})).toBeInTheDocument()
  })
  it('reports a failed change without hiding the roster',async()=>{
    m.updateMember.mockRejectedValue(new Error('private details'));const user=userEvent.setup();view();await screen.findByRole('table')
    await user.click(screen.getByRole('button',{name:'Manage Alex Rivera'}))
    await user.click(screen.getByRole('radio',{name:/^Admin/}))
    await user.click(screen.getByRole('button',{name:'Save role'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('has not been confirmed')
    expect(screen.getByRole('table')).toBeInTheDocument();expect(screen.queryByText('private details')).not.toBeInTheDocument()
  })
  it('invites people from the People page',async()=>{
    const user=userEvent.setup();view();await screen.findByRole('table')
    await user.click(screen.getByRole('button',{name:'Invite people'}))
    await user.type(screen.getByLabelText('Email'),'new@example.test')
    await user.selectOptions(screen.getByLabelText('Role'),'admin')
    await user.click(screen.getByRole('button',{name:'Send invitation'}))
    await waitFor(()=>expect(m.invite).toHaveBeenCalledWith({email:'new@example.test',role:'admin',requestId:expect.any(String)}))
    expect(await screen.findByText('Invitation sent to new@example.test.')).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'Send invitation'})).not.toBeInTheDocument()
  })
  it('shows members a read-only, names-only directory',async()=>{
    m.settings.mockResolvedValue({...settings,role:'member'});view()
    expect(await screen.findByText(/You're a member/)).toBeInTheDocument()
    expect(names()).toEqual(['Morgan Lee','Alex Rivera'])
    expect(screen.queryByRole('columnheader',{name:'Status'})).not.toBeInTheDocument()
    expect(screen.queryByRole('button',{name:/manage|invite/i})).not.toBeInTheDocument()
    expect(m.joinCodes).not.toHaveBeenCalled();expect(m.members).not.toHaveBeenCalled();expect(m.invitations).not.toHaveBeenCalled()
    expect(screen.queryByText(/@example\.test/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Filter by status')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation',{name:'Organization sections'})).not.toBeInTheDocument()
    expect(screen.queryByRole('link',{name:/invitation|settings/i})).not.toBeInTheDocument()
  })
  it('reports a failed read without showing a partial directory',async()=>{
    m.members.mockRejectedValue(new Error('private details'));view()
    expect(await screen.findByRole('alert')).toHaveTextContent('directory is unavailable')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByText('private details')).not.toBeInTheDocument()
  })
})

describe('Optimistic people controls',()=>{
  it('shows a role change in the roster before the server confirms it',async()=>{
    const d=deferred();m.updateMember.mockReturnValue(d.promise);const user=userEvent.setup();view();await screen.findByRole('table')
    await user.click(screen.getByRole('button',{name:'Manage Alex Rivera'}))
    await user.click(screen.getByRole('radio',{name:/^Admin/}))
    await user.click(screen.getByRole('button',{name:'Save role'}))
    expect(screen.getByText("5 people · 4 admins · You're an owner")).toBeInTheDocument()
    expect(m.members).toHaveBeenCalledTimes(1)
    d.resolve({})
    expect(await screen.findByText('Alex Rivera is now an admin.')).toBeInTheDocument()
    await waitFor(()=>expect(m.members).toHaveBeenCalledTimes(2))
  })
  it('takes a removed person off the roster at once and puts them back when the server reports a conflict',async()=>{
    const d=deferred();m.updateMember.mockReturnValue(d.promise);const user=userEvent.setup();view();await screen.findByRole('table')
    await user.click(screen.getByRole('button',{name:'Manage Alex Rivera'}))
    await user.click(screen.getByRole('button',{name:'Remove from organization'}))
    await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Remove'}))
    expect(names()).not.toContain('Alex Rivera')
    expect(screen.queryByRole('complementary',{name:'Manage Alex Rivera'})).not.toBeInTheDocument()
    d.reject(new DatabaseApiClientError(409))
    expect(await screen.findByRole('alert')).toHaveTextContent('Someone else changed this person')
    expect(names()).toContain('Alex Rivera')
    expect(m.members).toHaveBeenCalledTimes(1)
  })
  it('restores the previous role when a role change fails',async()=>{
    const d=deferred();m.updateMember.mockReturnValue(d.promise);const user=userEvent.setup();view();await screen.findByRole('table')
    await user.click(screen.getByRole('button',{name:'Manage Alex Rivera'}))
    await user.click(screen.getByRole('radio',{name:/^Admin/}))
    await user.click(screen.getByRole('button',{name:'Save role'}))
    expect(screen.getByText("5 people · 4 admins · You're an owner")).toBeInTheDocument()
    d.reject(new Error('private details'))
    expect(await screen.findByRole('alert')).toHaveTextContent('has not been confirmed')
    expect(screen.getByText("5 people · 3 admins · You're an owner")).toBeInTheDocument()
  })
})
