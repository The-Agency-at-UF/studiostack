import {cleanup,render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import Onboarding from './Onboarding'
const m=vi.hoisted(()=>({onboarding:vi.fn(),acceptInvitation:vi.fn(),joinByDomain:vi.fn(),joinByCode:vi.fn(),requestAccess:vi.fn(),withdrawAccessRequest:vi.fn(),register:vi.fn()}))
vi.mock('../../api/database',()=>({createDatabaseApiClient:()=>m,DatabaseApiClientError:class extends Error{constructor(public status:number){super()}}}))
vi.mock('../../auth/cognito',()=>({authConfiguration:()=>({apiUrl:'https://api.example.test'})}))
vi.mock('../Production/EmailVerification',()=>({default:()=>null}))
const empty={email:'new@studio.example.edu',displayName:'new@studio.example.edu',invitations:[],domainMatches:[],requests:[]}
const view=(onJoined=vi.fn().mockResolvedValue(undefined))=>{render(<Onboarding getAccessToken={async()=>'token'} onJoined={onJoined}/>);return onJoined}
beforeEach(()=>{vi.clearAllMocks();m.onboarding.mockResolvedValue(empty);m.register.mockResolvedValue({})})
afterEach(cleanup)
describe('New account onboarding',()=>{
  it('waits with clear next steps when there is no way in yet',async()=>{
    view();expect(await screen.findByRole('heading',{name:'You’re not in a workspace yet'})).toBeInTheDocument()
    expect(screen.getByText(/Ask a workspace administrator to invite/)).toHaveTextContent('new@studio.example.edu')
    expect(screen.getByRole('button',{name:'Join with code'})).toBeDisabled()
  })
  it('accepts an invitation, confirms the invited name and opens the workspace',async()=>{
    m.onboarding.mockResolvedValue({...empty,invitations:[{id:'invite',organizationId:'org',organizationName:'Agency',role:'member',displayName:'Jordan Lee',expiresAt:'2026-12-01'}]});m.acceptInvitation.mockResolvedValue({organizationId:'org'})
    const user=userEvent.setup(),onJoined=view()
    await user.click(await screen.findByRole('button',{name:'Accept invitation to Agency'}))
    expect(await screen.findByRole('heading',{name:'You’re in Agency.'})).toBeInTheDocument()
    expect(screen.getByLabelText('Your name')).toHaveValue('Jordan Lee')
    await user.clear(screen.getByLabelText('Your name'));await user.type(screen.getByLabelText('Your name'),'Jordan L.');await user.click(screen.getByRole('button',{name:'Continue to workspace'}))
    await waitFor(()=>expect(onJoined).toHaveBeenCalledWith('org'));expect(m.register).toHaveBeenCalledWith('Jordan L.')
  })
  it('joins by verified domain or by code',async()=>{
    m.onboarding.mockResolvedValue({...empty,domainMatches:[{organizationId:'org',organizationName:'Agency',autoJoin:true}]});m.joinByDomain.mockResolvedValue({organizationId:'org'})
    const user=userEvent.setup();view()
    await user.click(await screen.findByRole('button',{name:'Join Agency'}));expect(m.joinByDomain).toHaveBeenCalledWith('org')
    expect(await screen.findByLabelText('Your name')).toHaveValue('new@studio.example.edu')
    cleanup();m.onboarding.mockResolvedValue(empty);m.joinByCode.mockRejectedValueOnce(Object.assign(new Error(),{status:404}));m.joinByCode.mockResolvedValue({organizationId:'other'})
    view();const input=await screen.findByLabelText('Have a join code?')
    await user.type(input,'abcde-fghjk');await user.click(screen.getByRole('button',{name:'Join with code'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('not valid')
    await user.click(screen.getByRole('button',{name:'Join with code'}))
    expect(await screen.findByRole('heading',{name:'You’ve joined the workspace.'})).toBeInTheDocument();expect(m.joinByCode).toHaveBeenLastCalledWith('abcde-fghjk')
  })
  it('requests access with a note, then shows the pending request with withdraw',async()=>{
    m.onboarding.mockResolvedValueOnce({...empty,domainMatches:[{organizationId:'org',organizationName:'Agency',autoJoin:false}]})
      .mockResolvedValue({...empty,domainMatches:[{organizationId:'org',organizationName:'Agency',autoJoin:false}],requests:[{id:'req',organizationId:'org',organizationName:'Agency',status:'pending',createdAt:'2026-10-31T12:00:00Z',decidedAt:null}]})
    m.requestAccess.mockResolvedValue({});m.withdrawAccessRequest.mockResolvedValue({})
    const user=userEvent.setup();view()
    await user.type(await screen.findByLabelText('Note for administrators (optional)'),'Fall shoot crew');await user.click(screen.getByRole('button',{name:'Request access to Agency'}))
    expect(m.requestAccess).toHaveBeenCalledWith('org','Fall shoot crew')
    expect(await screen.findByRole('heading',{name:'Waiting for approval'})).toBeInTheDocument()
    await user.click(screen.getByRole('button',{name:'Withdraw request'}));expect(m.withdrawAccessRequest).toHaveBeenCalledWith('req','org')
  })
  it('asks for email verification when the directory refuses an unverified account',async()=>{
    const {DatabaseApiClientError}=await import('../../api/database');m.onboarding.mockRejectedValue(new (DatabaseApiClientError as unknown as new(status:number)=>Error)(403))
    view();expect(await screen.findByText(/Verify your sign-in email above/)).toBeInTheDocument()
  })
})
