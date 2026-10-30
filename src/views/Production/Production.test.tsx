import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Production from './Production'
import {invalidateCache,setCached} from '../../api/cache'
import { AppSessionProvider } from '../../context/AppSessionContext'
vi.mock('next/dynamic',()=>({default:()=>()=> <p>Calendar surface</p>}))
vi.mock('../../auth/cognito',()=>({authConfiguration:()=>({apiUrl:'https://api.example.org'})}))
function renderPreview() { return render(<AppSessionProvider value={{email:'demo@example.org',isAdmin:true,setEmail:vi.fn(),setIsAdmin:vi.fn(),mode:'preview'}}><Production /></AppSessionProvider>) }
beforeEach(()=>{localStorage.clear();window.history.replaceState(null,'','/production/');vi.restoreAllMocks()})
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals()})
describe('production workspace',()=>{
  it('keeps cached production usable while a return visit refresh is pending',async()=>{
    setCached('production:cache-org',{briefs:[],clients:[],deliveries:[],access:{userId:'member',canReview:false,canAdminister:false,isExecutive:false}})
    vi.stubGlobal('fetch',vi.fn(()=>new Promise(()=>{})))
    render(<AppSessionProvider value={{email:'member@example.org',isAdmin:false,setEmail:vi.fn(),setIsAdmin:vi.fn(),mode:'authenticated',getAccessToken:async()=> 'token',organizations:[{id:'cache-org',name:'Agency',slug:'agency',role:'member'}]}}><Production /></AppSessionProvider>)
    expect(screen.queryByText('Loading production workspace…')).not.toBeInTheDocument()
    expect(screen.getByRole('heading',{name:'Start with a brief'})).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button',{name:'Production calendar'}))
    expect(screen.getByText('Calendar surface')).toBeInTheDocument()
  })
  it('finishes loading once with production caching enabled and keeps tabs usable',async()=>{
    invalidateCache()
    let accessCalls=0
    const fetcher=vi.fn((url:string)=>{
      if(url.endsWith('/access')){accessCalls++;if(accessCalls>1)return new Promise<Response>(()=>{});return Promise.resolve(new Response(JSON.stringify({userId:'member',canReview:false,canAdminister:false,isExecutive:false}))) }
      return Promise.resolve(new Response(JSON.stringify({items:[],nextCursor:null})))
    })
    vi.stubGlobal('fetch',fetcher)
    const view=render(<AppSessionProvider value={{email:'member@example.org',isAdmin:false,setEmail:vi.fn(),setIsAdmin:vi.fn(),mode:'authenticated',getAccessToken:async()=> 'token',organizations:[{id:'cache-org',name:'Agency',slug:'agency',role:'member'}]}}><Production /></AppSessionProvider>)
    try{await waitFor(()=>expect(screen.queryByText('Loading production workspace…')).not.toBeInTheDocument());await act(async()=>{await new Promise(resolve=>setTimeout(resolve,30))});expect(accessCalls).toBe(1);await userEvent.setup().click(screen.getByRole('button',{name:'Production calendar'}));expect(screen.getByText('Calendar surface')).toBeInTheDocument();expect(accessCalls).toBe(1)}finally{view.unmount();invalidateCache()}
  })

  it('supports a complete edit-only draft and submission with conditional fields',async()=>{
    const user=userEvent.setup();renderPreview();await screen.findByRole('button',{name:'Campus stories'})
    await user.click(screen.getByRole('button',{name:/New brief/}));await screen.findByRole('heading',{name:'New production brief'})
    expect(screen.getByRole('button',{name:'Submit for review'})).toBeDisabled()
    await user.type(screen.getByLabelText('Project name *'),'Editing request');await user.type(screen.getByLabelText('Client *'),'Example client');await user.type(screen.getByLabelText('Account / project managers *'),'Alex')
    await user.type(screen.getByLabelText('Target delivery date *'),'2026-12-20');await user.click(screen.getByLabelText('Video Editing'))
    expect(screen.queryByText('Primary location')).not.toBeInTheDocument()
    for(const [label,value] of [['Project summary *','Edit an existing interview.'],['Primary objective *','Introduce the client.'],['Target audience *','Students'],['Where will the content appear? *','YouTube'],['Deliverables and quantity *','One video.'],['Editing style / direction *','Conversational pacing.']]) await user.type(screen.getByLabelText(label),value)
    await user.click(screen.getByRole('button',{name:'Save draft'}));await screen.findByText('All changes saved')
    await user.click(screen.getByRole('button',{name:'Submit for review'}));await waitFor(()=>expect(screen.queryByRole('button',{name:'Submit for review'})).not.toBeInTheDocument())
    expect(screen.getByText('In review',{selector:'.production-status'})).toBeInTheDocument();expect(screen.getByRole('button',{name:/View revision/})).toBeInTheDocument()
  })
  it('lets configured Production leadership approve and confirms the proposed dates',async()=>{
    const user=userEvent.setup();renderPreview();await screen.findByRole('button',{name:'Campus stories'})
    await user.selectOptions(screen.getByRole('combobox',{name:/Preview as/}),'preview-reviewer');await screen.findByRole('button',{name:'Decisions & delivery'})
    await user.click(screen.getByRole('button',{name:'Campus stories'}));await screen.findByRole('button',{name:'Approve & confirm dates'})
    expect(screen.getByRole('button',{name:'Deny brief'})).toBeDisabled()
    await user.click(screen.getByRole('button',{name:'Approve & confirm dates'}));await screen.findByText(/^Confirmed shoot:/,{selector:'.production-review p'})
    expect(screen.getByText('Approved',{selector:'.production-status'})).toBeInTheDocument()
    await user.click(screen.getByRole('button',{name:'Decisions & delivery'}));await screen.findByRole('heading',{name:'Executive Leadership Team decisions'})
    expect(await screen.findByText('No email delivery was queued for this decision.')).toBeInTheDocument()
  })
  it('exposes access settings only to administrators and persists reviewer selection',async()=>{
    const user=userEvent.setup();renderPreview();await screen.findByRole('button',{name:'Campus stories'})
    expect(screen.queryByRole('button',{name:'Access & notifications'})).not.toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox',{name:/Preview as/}),'preview-admin');await user.click(await screen.findByRole('button',{name:'Access & notifications'}))
    const reviewer=await screen.findByRole('checkbox',{name:'Production leadership: Alex · Client Services'});await user.click(reviewer)
    await user.click(screen.getByRole('button',{name:'Save settings'}));await screen.findByText('Production access and notification settings saved.')
    await user.selectOptions(screen.getByRole('combobox',{name:/Preview as/}),'preview-author');await screen.findByRole('button',{name:'Decisions & delivery'})
    expect(screen.queryByRole('button',{name:'Access & notifications'})).not.toBeInTheDocument()
  })
  it('never substitutes preview records when an authenticated service request fails',async()=>{
    vi.useFakeTimers()
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:503})))
    render(<AppSessionProvider value={{email:'member@example.org',isAdmin:false,setEmail:vi.fn(),setIsAdmin:vi.fn(),mode:'authenticated',getAccessToken:async()=> 'token',organizations:[{id:'11111111-1111-4111-8111-111111111111',name:'Real org',slug:'real',role:'member'}]}}><Production /></AppSessionProvider>)
    await act(async()=>{await vi.advanceTimersByTimeAsync(7100)})
    expect(screen.getByText(/Production services are unavailable/)).toHaveAttribute('role','alert')
    expect(screen.queryByRole('button',{name:'Campus stories'})).not.toBeInTheDocument()
    expect(screen.queryByText(/Local preview/)).not.toBeInTheDocument()
  })
})
