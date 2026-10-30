import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import InvitationInbox from './InvitationInbox'
const mocks=vi.hoisted(()=>({list:vi.fn(),accept:vi.fn()}))
vi.mock('../../api/database',()=>({createDatabaseApiClient:()=>({pendingInvitations:mocks.list,acceptInvitation:mocks.accept}),DatabaseApiClientError:class extends Error{constructor(public status:number){super()}}}))
vi.mock('../../auth/cognito',()=>({authConfiguration:()=>({apiUrl:'https://api.example.test'})}))
vi.mock('../Production/EmailVerification',()=>({default:()=> <p>Email verification</p>}))
beforeEach(()=>{vi.clearAllMocks();mocks.list.mockResolvedValue({items:[{id:'invite',organizationId:'org',organizationName:'Studio',role:'member',expiresAt:'2026-12-01'}]});mocks.accept.mockResolvedValue({organizationId:'org'})})
afterEach(cleanup)
describe('Invitation inbox',()=>{
  it('accepts the chosen organization and refreshes memberships',async()=>{const refresh=vi.fn();render(<InvitationInbox getAccessToken={async()=> 'token'} onAccepted={refresh}/>);fireEvent.click(await screen.findByRole('button',{name:'Accept invitation'}));expect(await screen.findByRole('status')).toHaveTextContent('Joined Studio.');expect(mocks.accept).toHaveBeenCalledWith('invite','org');expect(refresh).toHaveBeenCalledOnce()})
  it('keeps a failed acceptance available and does not claim membership',async()=>{mocks.accept.mockRejectedValue(new Error());const refresh=vi.fn();render(<InvitationInbox getAccessToken={async()=> 'token'} onAccepted={refresh}/>);fireEvent.click(await screen.findByRole('button',{name:'Accept invitation'}));expect(await screen.findByRole('alert')).toHaveTextContent('could not be accepted');expect(refresh).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'Accept invitation'})).toBeEnabled()})
})
