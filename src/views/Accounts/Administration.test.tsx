import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import Administration from './Administration'
import {AppSessionProvider} from '../../context/AppSessionContext'
const m=vi.hoisted(()=>({settings:vi.fn(),members:vi.fn(),invitations:vi.fn(),activity:vi.fn(),invite:vi.fn(),updateMember:vi.fn(),saveSettings:vi.fn(),refresh:vi.fn(),accessRequests:vi.fn(),joinCodes:vi.fn(),domains:vi.fn(),createJoinCode:vi.fn(),revokeJoinCode:vi.fn(),decideAccessRequest:vi.fn(),addDomain:vi.fn(),updateDomain:vi.fn(),removeDomain:vi.fn()}))
vi.mock('../../api/database',()=>({createDatabaseApiClient:()=>({accounts:()=>m}),DatabaseApiClientError:class extends Error{constructor(public status:number){super()}}}))
vi.mock('../../auth/cognito',()=>({authConfiguration:()=>({apiUrl:'https://api.example.test'})}))
const settings={id:'org',name:'Agency',slug:'agency',role:'owner',reservationDays:14,version:1}
function view(){render(<AppSessionProvider value={{email:'owner@example.test',isAdmin:true,setEmail:vi.fn(),setIsAdmin:vi.fn(),mode:'authenticated',getAccessToken:async()=> 'token',selectedOrganizationId:'org',refreshOrganizations:m.refresh}}><Administration/></AppSessionProvider>)}
beforeEach(()=>{vi.clearAllMocks();m.settings.mockResolvedValue(settings);m.members.mockResolvedValue({items:[{id:'member',displayName:'Teammate',email:'member@example.test',role:'member',status:'active',version:2}],nextCursor:null});for(const name of ['invitations','activity','accessRequests','joinCodes','domains']as const)m[name].mockResolvedValue({items:[],nextCursor:null});m.invite.mockResolvedValue({});m.updateMember.mockResolvedValue({})})
afterEach(cleanup)
describe('Real account administration',()=>{
  it('sends an invitation through the authenticated organization client',async()=>{const user=userEvent.setup();view();await screen.findByText('Teammate');await user.type(screen.getByLabelText('Name'),'New teammate');await user.type(screen.getByLabelText('Email'),'new@example.test');await user.click(screen.getByRole('button',{name:'Send invitation'}));await waitFor(()=>expect(m.invite).toHaveBeenCalledWith({displayName:'New teammate',email:'new@example.test',role:'member',requestId:expect.any(String)}));expect(m.refresh).toHaveBeenCalled()})
  it('prevents administrators from promoting members to privileged roles in the interface',async()=>{m.settings.mockResolvedValue({...settings,role:'admin'});view();expect(await screen.findByLabelText('Role for Teammate')).toBeDisabled();expect(screen.queryByRole('option',{name:'Administrator',hidden:false})?.closest('select')).toBeDisabled();fireEvent.change(screen.getByLabelText('Status for Teammate'),{target:{value:'suspended'}});fireEvent.click(screen.getByRole('button',{name:'Save member'}));await waitFor(()=>expect(m.updateMember).toHaveBeenCalledWith('member',{role:'member',status:'suspended',version:2,requestId:expect.any(String)}))})
  it('shows a new join code once and approves a pending access request',async()=>{
    m.accessRequests.mockResolvedValue({items:[{id:'request',userId:'u',email:'asker@studio.example.edu',displayName:'Asker',message:'Fall crew',status:'pending',version:1,createdAt:'2026-10-30T12:00:00Z',decidedAt:null}],nextCursor:null})
    m.createJoinCode.mockResolvedValue({id:'code',label:'Spring crew',maxUses:5,uses:0,expiresAt:null,revokedAt:null,version:1,createdAt:'2026-10-31T12:00:00Z',code:'ABCDE-FGHJK'});m.decideAccessRequest.mockResolvedValue({})
    const user=userEvent.setup();view();expect(await screen.findByLabelText('1 pending')).toBeInTheDocument();expect(screen.getByText('“Fall crew”')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Code label'),'Spring crew');await user.type(screen.getByLabelText('Maximum uses'),'5');await user.click(screen.getByRole('button',{name:'Create join code'}))
    expect(await screen.findByText('ABCDE-FGHJK')).toBeInTheDocument();expect(m.createJoinCode).toHaveBeenCalledWith(expect.objectContaining({label:'Spring crew',maxUses:5,expiresInDays:null,requestId:expect.any(String)}))
    await user.click(screen.getByRole('button',{name:'Approve Asker'}));await waitFor(()=>expect(m.decideAccessRequest).toHaveBeenCalledWith('request','approve',expect.objectContaining({version:1})))
  })
  it('lets owners, not administrators, manage workspace domains',async()=>{
    m.domains.mockResolvedValue({items:[{domain:'studio.example.edu',autoJoin:true,version:2,createdAt:'2026-10-30T12:00:00Z'}],nextCursor:null});m.updateDomain.mockResolvedValue({})
    const user=userEvent.setup();view();expect(await screen.findByText('studio.example.edu')).toBeInTheDocument()
    await user.click(screen.getByRole('button',{name:'Require requests'}));await waitFor(()=>expect(m.updateDomain).toHaveBeenCalledWith('studio.example.edu',expect.objectContaining({autoJoin:false,version:2})))
    cleanup();vi.clearAllMocks();m.settings.mockResolvedValue({...settings,role:'admin'});view();expect(await screen.findByRole('heading',{name:'Join codes'})).toBeInTheDocument()
    expect(screen.queryByRole('heading',{name:'Workspace domains'})).not.toBeInTheDocument();expect(m.domains).not.toHaveBeenCalled()
  })
  it('shows service failures without substituting preview members',async()=>{m.members.mockRejectedValue(new Error('private details'));view();expect(await screen.findByRole('alert')).toHaveTextContent('service is unavailable');expect(screen.queryByText('Teammate')).not.toBeInTheDocument();expect(screen.queryByText('private details')).not.toBeInTheDocument()})
})
