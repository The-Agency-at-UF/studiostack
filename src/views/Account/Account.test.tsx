import {cleanup,fireEvent,render,screen,within} from '@testing-library/react'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import Account from './Account'
import {AppSessionProvider,type AppSession} from '../../context/AppSessionContext'
const mocks=vi.hoisted(()=>({list:vi.fn(),accept:vi.fn(),code:vi.fn()}))
vi.mock('../../api/database',()=>({createDatabaseApiClient:()=>({pendingInvitations:mocks.list,acceptInvitation:mocks.accept,joinByCode:mocks.code}),DatabaseApiClientError:class extends Error{constructor(public status:number){super()}}}))
vi.mock('../../auth/cognito',()=>({authConfiguration:()=>({apiUrl:'https://api.example.test'})}))
vi.mock('../Production/EmailVerification',()=>({default:()=><p>Email verification</p>}))
const organizations=[{id:'agency',slug:'agency',name:'The Agency at UF',role:'member' as const},{id:'lab',slug:'lab',name:'Media Lab',role:'admin' as const,logoUrl:'https://cdn.example.test/lab.png'}]
function renderAccount(overrides:Partial<AppSession>={}) {
  const session:AppSession={email:'roger@example.test',isAdmin:false,setEmail:vi.fn(),setIsAdmin:vi.fn(),mode:'authenticated',getAccessToken:async()=>'token',organizations,selectedOrganizationId:'agency',setSelectedOrganizationId:vi.fn(),refreshOrganizations:vi.fn().mockResolvedValue(undefined),signOut:vi.fn(),...overrides}
  render(<AppSessionProvider value={session}><Account/></AppSessionProvider>)
  return session
}
beforeEach(()=>{vi.clearAllMocks();mocks.list.mockResolvedValue({items:[]});mocks.accept.mockResolvedValue({organizationId:'studio'});mocks.code.mockResolvedValue({organizationId:'studio'})})
afterEach(cleanup)
describe('Account page',()=>{
  it('lists workspaces with logos or monograms and switches the current one',async()=>{
    const session=renderAccount()
    expect(screen.getByRole('heading',{level:1,name:'roger@example.test'})).toBeInTheDocument()
    expect(screen.getByText('Member of The Agency at UF')).toBeInTheDocument()
    const agency=screen.getByRole('radio',{name:/The Agency at UF/}),lab=screen.getByRole('radio',{name:/Media Lab/})
    expect(agency).toBeChecked()
    expect(agency.closest('label')).toHaveTextContent('A')
    expect(lab.closest('label')?.querySelector('img')).toHaveAttribute('src','https://cdn.example.test/lab.png')
    fireEvent.click(lab)
    expect(session.setSelectedOrganizationId).toHaveBeenCalledWith('lab')
    await screen.findByText(/No pending invitations/)
  })
  it('accepts an invitation and makes it the current workspace',async()=>{
    mocks.list.mockResolvedValue({items:[{id:'invite',organizationId:'studio',organizationName:'Studio',role:'member',expiresAt:'2026-12-01'}]})
    const session=renderAccount()
    fireEvent.click(await screen.findByRole('button',{name:'Join Studio'}))
    expect(await screen.findByRole('status')).toHaveTextContent('Joined Studio.')
    expect(mocks.accept).toHaveBeenCalledWith('invite','studio')
    expect(session.refreshOrganizations).toHaveBeenCalledOnce()
    expect(session.setSelectedOrganizationId).toHaveBeenCalledWith('studio')
  })
  it('requires a join code and reports an invalid one without joining',async()=>{
    const {DatabaseApiClientError}=await import('../../api/database')
    const session=renderAccount()
    await screen.findByText(/No pending invitations/)
    fireEvent.click(screen.getByRole('button',{name:'Join workspace'}))
    expect(screen.getByText('Enter the join code from your workspace administrator.')).toBeInTheDocument()
    expect(mocks.code).not.toHaveBeenCalled()
    mocks.code.mockRejectedValue(new (DatabaseApiClientError as unknown as new(status:number)=>Error)(404))
    fireEvent.change(screen.getByRole('textbox',{name:'Have a join code?'}),{target:{value:'WRONG-CODE'}})
    fireEvent.click(screen.getByRole('button',{name:'Join workspace'}))
    expect(await screen.findByText(/That join code is not valid/)).toBeInTheDocument()
    expect(session.refreshOrganizations).not.toHaveBeenCalled()
  })
  it('switches sections and signs out from the section menu',()=>{
    const session=renderAccount()
    const sections=screen.getByRole('navigation',{name:'Account sections'})
    fireEvent.click(within(sections).getByRole('button',{name:'Profile'}))
    expect(screen.getByRole('textbox',{name:'Email'})).toHaveValue('roger@example.test')
    expect(screen.getByText('Email verification')).toBeInTheDocument()
    fireEvent.click(within(sections).getByRole('button',{name:'Sign out'}))
    expect(session.signOut).toHaveBeenCalledOnce()
  })
  it('does not load invitations in preview',()=>{
    renderAccount({mode:'preview',getAccessToken:undefined})
    expect(screen.getByText('Sign in to see invitations for your email.')).toBeInTheDocument()
    expect(mocks.list).not.toHaveBeenCalled()
  })
})
