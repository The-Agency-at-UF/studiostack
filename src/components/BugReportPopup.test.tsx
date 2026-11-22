import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {AppSessionProvider} from '../context/AppSessionContext'
import BugReportPopup from './BugReportPopup'
const mock=vi.hoisted(()=>({submit:vi.fn(),list:vi.fn()}))
vi.mock('next/navigation',()=>({usePathname:()=>'/inventory/'}))
vi.mock('../auth/cognito',()=>({authConfiguration:()=>({apiUrl:'https://api.test'})}))
vi.mock('../api/database',()=>({createDatabaseApiClient:()=>({submitBugReport:mock.submit,bugReports:mock.list})}))
beforeEach(()=>{vi.clearAllMocks();mock.submit.mockResolvedValue({id:'report'});mock.list.mockResolvedValue({items:[{id:'saved',title:'Earlier report',description:'Still here',pagePath:'/inventory/',createdAt:'2026-10-29T00:00:00Z'}],nextCursor:null})})
afterEach(cleanup)
it('saves signed-in reports through the organization API without sharing URL query data',async()=>{
 const user=userEvent.setup();render(<AppSessionProvider value={{email:'member@example.test',isAdmin:false,setEmail:vi.fn(),setIsAdmin:vi.fn(),mode:'authenticated',selectedOrganizationId:'org',getAccessToken:async()=> 'token'}}><BugReportPopup open userEmail="member@example.test"/></AppSessionProvider>)
 await user.type(screen.getByPlaceholderText('What happened?'),'Broken button');await user.type(screen.getByPlaceholderText('Provide more details...'),'Details');await user.click(screen.getByRole('button',{name:'Submit report'}))
 await waitFor(()=>expect(mock.submit).toHaveBeenCalledWith('org',{kind:'bug',title:'Broken button',description:'Details',pagePath:'/inventory/',requestId:expect.any(String)}))
})

it('loads the signed-in account’s saved reports on request',async()=>{const user=userEvent.setup();render(<AppSessionProvider value={{email:'member@example.test',isAdmin:false,setEmail:vi.fn(),setIsAdmin:vi.fn(),mode:'authenticated',selectedOrganizationId:'org',getAccessToken:async()=> 'token'}}><BugReportPopup open userEmail="member@example.test"/></AppSessionProvider>);await user.click(screen.getByText('Your submitted reports'));expect(await screen.findByText('Earlier report')).toBeInTheDocument();expect(mock.list).toHaveBeenCalledWith('org',{limit:100,after:undefined},'bug')})

it('files feature requests through the same API and lists only requests',async()=>{
 const user=userEvent.setup();render(<AppSessionProvider value={{email:'admin@example.test',isAdmin:true,setEmail:vi.fn(),setIsAdmin:vi.fn(),mode:'authenticated',selectedOrganizationId:'org',getAccessToken:async()=> 'token'}}><BugReportPopup open kind="feature" userEmail="admin@example.test"/></AppSessionProvider>)
 expect(screen.getByRole('heading',{name:'Request a feature'})).toBeInTheDocument()
 await user.click(screen.getByText('Your submitted requests'));await waitFor(()=>expect(mock.list).toHaveBeenCalledWith('org',{limit:100,after:undefined},'feature'))
 await user.type(screen.getByPlaceholderText('What would you like?'),'Bulk checkout');await user.type(screen.getByPlaceholderText('Provide more details...'),'Details');await user.click(screen.getByRole('button',{name:'Submit request'}))
 await waitFor(()=>expect(mock.submit).toHaveBeenCalledWith('org',{kind:'feature',title:'Bulk checkout',description:'Details',pagePath:'/inventory/',requestId:expect.any(String)}))
 expect(await screen.findByText('Request submitted')).toBeInTheDocument()
})

it('starts a fresh form after closing a submitted report',async()=>{
 const user=userEvent.setup();render(<AppSessionProvider value={{email:'member@example.test',isAdmin:false,setEmail:vi.fn(),setIsAdmin:vi.fn(),mode:'authenticated',selectedOrganizationId:'org',getAccessToken:async()=> 'token'}}><BugReportPopup userEmail="member@example.test"/></AppSessionProvider>)
 await user.click(screen.getByRole('button',{name:'Report a bug'}))
 await user.type(screen.getByLabelText(/^Title/),'Broken');await user.type(screen.getByLabelText(/^Description/),'Details');await user.click(screen.getByRole('button',{name:'Submit report'}))
 expect(await screen.findByText('Report submitted')).toHaveFocus()
 await user.click(screen.getByRole('button',{name:'Close dialog'}))
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
 await user.click(screen.getByRole('button',{name:'Report a bug'}))
 expect(screen.getByLabelText(/^Title/)).toHaveValue('')
})

it('is a named modal dialog that keeps an unsent draft when closed and returns focus to its opener',async()=>{
 const user=userEvent.setup();render(<AppSessionProvider value={{email:'member@example.test',isAdmin:false,setEmail:vi.fn(),setIsAdmin:vi.fn(),mode:'authenticated',selectedOrganizationId:'org',getAccessToken:async()=> 'token'}}><BugReportPopup userEmail="member@example.test"/></AppSessionProvider>)
 const opener=screen.getByRole('button',{name:'Report a bug'});await user.click(opener)
 expect(screen.getByRole('dialog',{name:'Report a bug'})).toBeInTheDocument()
 await user.type(screen.getByLabelText(/^Title/),'Half-written')
 // jsdom does not turn Escape into the dialog's cancel event, so send it as the browser would.
 fireEvent(screen.getByRole('dialog'),new Event('cancel',{cancelable:true}))
 await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());expect(opener).toHaveFocus()
 await user.click(opener);expect(screen.getByLabelText(/^Title/)).toHaveValue('Half-written')
 await user.click(screen.getByRole('button',{name:'Submit report'}));expect(screen.getByRole('alert')).toHaveTextContent('Add a description.')
 expect(screen.getByLabelText(/^Description/)).toHaveAttribute('aria-invalid','true')
})
