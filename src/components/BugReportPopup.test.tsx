import {cleanup,render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {AppSessionProvider} from '../context/AppSessionContext'
import BugReportPopup from './BugReportPopup'
const mock=vi.hoisted(()=>({submit:vi.fn(),list:vi.fn()}))
vi.mock('next/navigation',()=>({usePathname:()=>'/inventory/'}))
vi.mock('./Popup',()=>({default:({children}:{children:(close:()=>void)=>import('react').ReactNode})=><div>{children(()=>{})}</div>}))
vi.mock('../auth/cognito',()=>({authConfiguration:()=>({apiUrl:'https://api.test'})}))
vi.mock('../api/database',()=>({createDatabaseApiClient:()=>({submitBugReport:mock.submit,bugReports:mock.list})}))
beforeEach(()=>{vi.clearAllMocks();mock.submit.mockResolvedValue({id:'report'});mock.list.mockResolvedValue({items:[{id:'saved',title:'Earlier report',description:'Still here',pagePath:'/inventory/',createdAt:'2026-10-29T00:00:00Z'}],nextCursor:null})})
afterEach(cleanup)
it('saves signed-in reports through the organization API without sharing URL query data',async()=>{
 const user=userEvent.setup();render(<AppSessionProvider value={{email:'member@example.test',isAdmin:false,setEmail:vi.fn(),setIsAdmin:vi.fn(),mode:'authenticated',selectedOrganizationId:'org',getAccessToken:async()=> 'token'}}><BugReportPopup userEmail="member@example.test"/></AppSessionProvider>)
 await user.type(screen.getByPlaceholderText('What happened?'),'Broken button');await user.type(screen.getByPlaceholderText('Provide more details...'),'Details');await user.click(screen.getByRole('button',{name:'Submit Report'}))
 await waitFor(()=>expect(mock.submit).toHaveBeenCalledWith('org',{kind:'bug',title:'Broken button',description:'Details',pagePath:'/inventory/',requestId:expect.any(String)}))
})

it('loads the signed-in account’s saved reports on request',async()=>{const user=userEvent.setup();render(<AppSessionProvider value={{email:'member@example.test',isAdmin:false,setEmail:vi.fn(),setIsAdmin:vi.fn(),mode:'authenticated',selectedOrganizationId:'org',getAccessToken:async()=> 'token'}}><BugReportPopup userEmail="member@example.test"/></AppSessionProvider>);await user.click(screen.getByText('Your submitted reports'));expect(await screen.findByText('Earlier report')).toBeInTheDocument();expect(mock.list).toHaveBeenCalledWith('org',{limit:100,after:undefined},'bug')})

it('files feature requests through the same API and lists only requests',async()=>{
 const user=userEvent.setup();render(<AppSessionProvider value={{email:'admin@example.test',isAdmin:true,setEmail:vi.fn(),setIsAdmin:vi.fn(),mode:'authenticated',selectedOrganizationId:'org',getAccessToken:async()=> 'token'}}><BugReportPopup kind="feature" userEmail="admin@example.test"/></AppSessionProvider>)
 expect(screen.getByRole('heading',{name:'Request a Feature'})).toBeInTheDocument()
 await user.click(screen.getByText('Your submitted requests'));await waitFor(()=>expect(mock.list).toHaveBeenCalledWith('org',{limit:100,after:undefined},'feature'))
 await user.type(screen.getByPlaceholderText('What would you like?'),'Bulk checkout');await user.type(screen.getByPlaceholderText('Provide more details...'),'Details');await user.click(screen.getByRole('button',{name:'Submit Request'}))
 await waitFor(()=>expect(mock.submit).toHaveBeenCalledWith('org',{kind:'feature',title:'Bulk checkout',description:'Details',pagePath:'/inventory/',requestId:expect.any(String)}))
 expect(await screen.findByText('Request Submitted!')).toBeInTheDocument()
})
