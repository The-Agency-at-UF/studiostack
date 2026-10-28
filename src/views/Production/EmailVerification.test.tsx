import { cleanup,render,screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
import EmailVerification from './EmailVerification'
const mocked=vi.hoisted(()=>({send:vi.fn()}))
vi.mock('@aws-sdk/client-cognito-identity-provider',()=>({CognitoIdentityProviderClient:class{send=mocked.send},GetUserCommand:class{kind='get'},GetUserAttributeVerificationCodeCommand:class{kind='send'},VerifyUserAttributeCommand:class{kind='verify'}}))
beforeEach(()=>{vi.clearAllMocks()});afterEach(cleanup)
describe('sign-up email verification',()=>{
  it('does not send a verification email automatically',async()=>{
    mocked.send.mockResolvedValue({UserAttributes:[{Name:'email',Value:'member@example.org'},{Name:'email_verified',Value:'false'}]})
    render(<EmailVerification getAccessToken={async()=> 'token'} />)
    expect(await screen.findByRole('button',{name:'Send verification code'})).toBeInTheDocument();expect(mocked.send).toHaveBeenCalledTimes(1)
  })
  it('lets the signed-in user request and enter their own verification code',async()=>{
    mocked.send.mockResolvedValueOnce({UserAttributes:[{Name:'email',Value:'member@example.org'},{Name:'email_verified',Value:'false'}]}).mockResolvedValue({})
    const user=userEvent.setup();render(<EmailVerification getAccessToken={async()=> 'token'} />)
    await user.click(await screen.findByRole('button',{name:'Send verification code'}));await user.type(await screen.findByLabelText('Email verification code'),'123456');await user.click(screen.getByRole('button',{name:'Verify email'}))
    await vi.waitFor(()=>expect(screen.queryByText('Verify your sign-in email')).not.toBeInTheDocument());expect(mocked.send).toHaveBeenCalledTimes(3)
  })
})
