import {useState} from 'react'
import {createPreviewProductionClient} from '../../production/preview'
import PreviewControls from '../../components/PreviewControls'
import { fireEvent, act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Production from './Production'
import {emptyBrief} from '../../types/production'
import {invalidateCache,setCached} from '../../api/cache'
import { AppSessionProvider } from '../../context/AppSessionContext'
vi.mock('next/dynamic',()=>({default:()=>()=> <p>Calendar surface</p>}))
vi.mock('../../auth/cognito',()=>({authConfiguration:()=>({apiUrl:'https://api.example.org'})}))
function PreviewHarness(){const [person,setPerson]=useState('preview-author');return <AppSessionProvider value={{email:'demo@example.org',isAdmin:person==='preview-admin',setEmail:vi.fn(),setIsAdmin:vi.fn(),mode:'preview',previewPersonId:person,setPreviewPersonId:setPerson}}><PreviewControls/><Production key={person}/></AppSessionProvider>}
function renderPreview(){return render(<PreviewHarness/>)}
beforeEach(()=>{localStorage.clear();window.history.replaceState(null,'','/production/');vi.restoreAllMocks()})
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals()})
describe('production workspace',()=>{
  it('LOGIC-016: a delayed deep link cannot replace a draft opened and edited from the cached list',async()=>{
    invalidateCache()
    window.history.replaceState(null,'','/production/?brief=first')
    const brief=(id:string,projectName:string)=>({id,organizationId:'cache-org',ownerId:'member',ownerName:'Member',status:'draft',version:1,submission:0,data:{...emptyBrief(),projectName},shootStartsAt:null,shootEndsAt:null,createdAt:'2026-11-01T00:00:00Z',updatedAt:'2026-11-01T00:00:00Z',events:[],attachments:[]})
    const first=brief('first','Linked draft'),second=brief('second','Chosen draft')
    const access={userId:'member',canReview:false,canAdminister:false,isExecutive:false}
    setCached('production:cache-org',{briefs:[first,second],clients:[],deliveries:[],access})
    let resolveFirst!: (response:Response)=>void
    const pending = new Promise<Response>(resolve=>{resolveFirst=resolve})
    const fetcher=vi.fn(async(url:string)=>{
      if(url.endsWith('/briefs/first'))return pending
      if(url.endsWith('/briefs/second'))return Response.json(second)
      if(url.endsWith('/access'))return Response.json(access)
      return Response.json({items:url.includes('/briefs?')?[first,second]:[],nextCursor:null})
    })
    vi.stubGlobal('fetch',fetcher)
    render(<AppSessionProvider value={{email:'member@example.org',isAdmin:false,setEmail:vi.fn(),setIsAdmin:vi.fn(),mode:'authenticated',getAccessToken:async()=> 'token',organizations:[{id:'cache-org',name:'Agency',slug:'agency',role:'member'}]}}><Production /></AppSessionProvider>)
    await waitFor(()=>expect(fetcher.mock.calls.some(([url])=>url.endsWith('/briefs/first'))).toBe(true))
    const user=userEvent.setup()
    await user.click(screen.getByRole('button',{name:'Chosen draft'}))
    const input=await screen.findByLabelText('Project name (required)')
    await user.type(input,' with edits')
    await act(async()=>{resolveFirst(Response.json(first))})
    expect(screen.getByLabelText('Project name (required)')).toHaveValue('Chosen draft with edits')
    invalidateCache()
  })
  it('keeps cached production usable while a return visit refresh is pending',async()=>{
    setCached('production:cache-org',{briefs:[],clients:[],deliveries:[],access:{userId:'member',canReview:false,canAdminister:false,isExecutive:false}})
    vi.stubGlobal('fetch',vi.fn(()=>new Promise(()=>{})))
    render(<AppSessionProvider value={{email:'member@example.org',isAdmin:false,setEmail:vi.fn(),setIsAdmin:vi.fn(),mode:'authenticated',getAccessToken:async()=> 'token',organizations:[{id:'cache-org',name:'Agency',slug:'agency',role:'member'}]}}><Production /></AppSessionProvider>)
    expect(screen.queryByText('Loading production workspace…')).not.toBeInTheDocument()
    expect(screen.getByRole('heading',{name:'Start with a brief'})).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'Production calendar'})).not.toBeInTheDocument()
  })
  it('opens the production calendar on its own page without workspace tabs',async()=>{
    setCached('production:cache-org',{briefs:[],clients:[],deliveries:[],access:{userId:'member',canReview:false,canAdminister:false,isExecutive:false}})
    vi.stubGlobal('fetch',vi.fn(()=>new Promise(()=>{})))
    render(<AppSessionProvider value={{email:'member@example.org',isAdmin:false,setEmail:vi.fn(),setIsAdmin:vi.fn(),mode:'authenticated',getAccessToken:async()=> 'token',organizations:[{id:'cache-org',name:'Agency',slug:'agency',role:'member'}]}}><Production view="calendar" /></AppSessionProvider>)
    expect(screen.getByRole('heading',{level:1,name:'Production calendar'})).toBeInTheDocument()
    expect(screen.getByText('Calendar surface')).toBeInTheDocument()
    expect(screen.getByRole('link',{name:'View briefs'})).toHaveAttribute('href',expect.stringMatching(/^\/production\/?$/))
    expect(screen.getByRole('button',{name:'New brief'})).toBeInTheDocument()
    expect(screen.queryByRole('tab',{name:'Briefs'})).not.toBeInTheDocument()
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
    try{await waitFor(()=>expect(screen.queryByText('Loading production workspace…')).not.toBeInTheDocument());await act(async()=>{await new Promise(resolve=>setTimeout(resolve,30))});expect(accessCalls).toBe(1);await userEvent.setup().click(screen.getByRole('tab',{name:'Client accounts'}));expect(accessCalls).toBe(1)}finally{view.unmount();invalidateCache()}
  })

  it('opens a print preview from the brief toolbar and preserves unsaved edits',async()=>{
    const user = userEvent.setup()
    const print = vi.fn()
    vi.stubGlobal('print', print)
    renderPreview()
    await user.click(await screen.findByRole('button', { name: 'New brief' }))
    const projectName = await screen.findByLabelText('Project name (required)')
    await user.type(projectName, 'Unsaved print title')

    const back = screen.getByRole('button', { name: /Back to briefs/ })
    const preview = screen.getByRole('button', { name: 'Print or save as PDF' })
    const remove = screen.getByRole('button', { name: 'Delete draft' })
    expect(back.nextElementSibling).toBe(preview)
    expect(remove.previousElementSibling).toHaveTextContent('Not submitted yet')
    expect(remove.parentElement?.querySelector('.production-status')).toHaveTextContent('Draft')

    await user.click(preview)
    expect(print).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Unsaved print title' })).toBeInTheDocument()
    expect(projectName).not.toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Close print preview' }))
    expect(projectName).toBeVisible()
    expect(projectName).toHaveValue('Unsaved print title')
  })
  it('supports a complete edit-only draft and submission with conditional fields',async()=>{
    const user=userEvent.setup();renderPreview();await screen.findByRole('button',{name:'Campus stories'})
    await user.click(screen.getByRole('button',{name:/New brief/}));await screen.findByRole('heading',{name:'New production brief'})
    const step=(name:string)=>user.click(within(screen.getByRole('navigation',{name:'Brief steps'})).getByRole('button',{name:new RegExp(name)}))
    expect(screen.getByLabelText('Project name (required)')).not.toHaveAttribute('aria-invalid')
    await user.click(screen.getByRole('button',{name:'Next: Project overview'}));expect(screen.getByLabelText('Project summary (required)')).not.toHaveAttribute('aria-invalid')
    await step('Review & submit');expect(screen.getByText('Still needed (10)')).toBeInTheDocument()
    await user.click(screen.getByRole('button',{name:'Submit for review'}));expect(screen.getByRole('alert')).toHaveTextContent('Fix all 10 items still needed before submitting.');expect(screen.queryByText('In review',{selector:'.production-status'})).not.toBeInTheDocument()
    await step('Basics');expect(screen.getByLabelText('Project name (required)')).toHaveAttribute('aria-invalid','true');expect(screen.getByText('Add a project name.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Project name (required)'),'Editing request');expect(screen.getByLabelText('Project name (required)')).not.toHaveAttribute('aria-invalid');await user.type(screen.getByLabelText('Client (required)'),'Example client');await user.type(screen.getByLabelText('Account / project managers (required)'),'Alex')
    await user.type(screen.getByLabelText('Target delivery date (required)'),'2026-12-20');await user.click(screen.getByLabelText(/Video Editing/))
    expect(within(screen.getByRole('navigation',{name:'Brief steps'})).queryByRole('button',{name:/On-site production/})).not.toBeInTheDocument()
    await user.click(screen.getByRole('button',{name:'Next: Project overview'}));expect(document.activeElement).toHaveAttribute('id','brief-step-title');expect(document.activeElement).toHaveTextContent('Project overview')
    for(const [label,value] of [['Project summary (required)','Edit an existing interview.'],['Primary objective (required)','Introduce the client.'],['Target audience (required)','Students'],['Where will the content appear? (required)','YouTube']]) await user.type(screen.getByLabelText(label),value)
    await step('Deliverables');await user.type(screen.getByLabelText('Deliverables and quantity (required)'),'One video.')
    await step('Post-production');await user.type(screen.getByLabelText('Editing style / direction (required)'),'Conversational pacing.')
    await user.click(screen.getByRole('button',{name:'Save draft'}));expect(await screen.findByText('All changes saved')).toHaveClass('production-saved-pulse')
    await step('Review & submit');expect(screen.getByText('Required details are complete.')).toBeInTheDocument()
    await user.click(screen.getByRole('button',{name:'Submit for review'}));await waitFor(()=>expect(screen.queryByRole('button',{name:'Submit for review'})).not.toBeInTheDocument())
    expect(await screen.findByText('Brief submitted for review.',{selector:'.ws-toast p'})).toBeInTheDocument()
    expect(screen.getByText('In review',{selector:'.production-status'})).toBeInTheDocument();expect(screen.queryByRole('button',{name:/View revision/})).not.toBeInTheDocument()
  })
  it('puts search first and filters briefs by the person who requested them',async()=>{
    const brief=(id:string,ownerId:string,ownerName:string,projectName:string)=>({id,organizationId:'cache-org',ownerId,ownerName,status:'draft',version:1,submission:0,data:{...emptyBrief(),projectName},shootStartsAt:null,shootEndsAt:null,createdAt:'2026-11-01T00:00:00Z',updatedAt:'2026-11-01T00:00:00Z',events:[],attachments:[]})
    setCached('production:cache-org',{briefs:[brief('a','u1','Andrew Chung','Spring launch'),brief('b','u2','Roger','Fall recap')],clients:[],deliveries:[],access:{userId:'u1',canReview:false,canAdminister:false,isExecutive:false}})
    vi.stubGlobal('fetch',vi.fn(()=>new Promise(()=>{})))
    render(<AppSessionProvider value={{email:'member@example.org',isAdmin:false,setEmail:vi.fn(),setIsAdmin:vi.fn(),mode:'authenticated',getAccessToken:async()=> 'token',organizations:[{id:'cache-org',name:'Agency',slug:'agency',role:'member'}]}}><Production /></AppSessionProvider>)
    const toolbar=document.querySelector('.production-toolbar')!
    expect(toolbar.firstElementChild).toContainElement(screen.getByRole('searchbox'))
    expect(screen.getByRole('button',{name:'Fall recap'})).toBeInTheDocument()
    const user=userEvent.setup()
    await user.click(screen.getByRole('button',{name:/Requested by/}))
    await user.type(screen.getByRole('combobox',{name:'Search requested by'}),'andr')
    expect(screen.queryByRole('option',{name:'Roger'})).not.toBeInTheDocument()
    await user.click(screen.getByRole('option',{name:'Andrew Chung'}))
    expect(screen.getByRole('button',{name:/Requested by/})).toHaveTextContent('Andrew Chung')
    expect(screen.getByRole('button',{name:'Spring launch'})).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'Fall recap'})).not.toBeInTheDocument()
    expect(screen.getByText(/1 brief \(Filters applied\)/)).toBeInTheDocument()
  })
  it('shows a past target date inline and reopens an untouched draft',async()=>{
    const user=userEvent.setup();renderPreview();await screen.findByRole('button',{name:'Campus stories'})
    await user.click(screen.getByRole('button',{name:'New brief'}))
    const input=await screen.findByLabelText('Target delivery date (required)')
    const draftUrl=window.location.search
    fireEvent.change(input,{target:{value:'2020-01-01'}})
    expect(input).toHaveAttribute('aria-invalid','true')
    expect(screen.getByText('Target delivery date is in the past.')).toBeInTheDocument()
    fireEvent.change(input,{target:{value:''}})
    await user.click(screen.getByRole('button',{name:/Back to briefs/}))
    await user.click(within(await screen.findByRole('dialog',{name:'Discard unsaved changes?'})).getByRole('button',{name:'Discard changes'}))
    await user.click(screen.getByRole('button',{name:'New brief'}))
    await screen.findByLabelText('Target delivery date (required)')
    expect(window.location.search).toBe(draftUrl)
  })
  it('lets the author delete a never-submitted draft from the brief list',async()=>{
    const user=userEvent.setup();renderPreview();await screen.findByRole('button',{name:'Campus stories'})
    expect(screen.queryByRole('button',{name:'Delete Campus stories'})).not.toBeInTheDocument()
    await user.click(screen.getByRole('button',{name:/New brief/}));await screen.findByRole('heading',{name:'New production brief'})
    await user.click(screen.getByRole('button',{name:/Back to briefs/}))
    await user.click(await screen.findByRole('button',{name:'Delete untitled brief'}))
    expect(screen.getByRole('dialog', {name:'Delete this draft?'})).toBeInTheDocument()
    expect(screen.getByRole('button', {name:'Keep it'})).toHaveFocus()
    await user.click(screen.getByRole('button', {name:'Keep it'}))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button',{name:'Delete untitled brief'}))
    await user.click(screen.getByRole('button',{name:'Delete draft'}))
    await screen.findByText('Brief deleted.')
    expect(screen.queryByRole('button',{name:'Delete untitled brief'})).not.toBeInTheDocument()
    expect(screen.getByRole('button',{name:'Campus stories'})).toBeInTheDocument()
  })
  it('asks in a themed dialog before denying a brief',async()=>{
    const user=userEvent.setup();renderPreview();await screen.findByRole('button',{name:'Campus stories'})
    await user.selectOptions(screen.getByRole('combobox',{name:/Preview account/}),'preview-reviewer');await screen.findByRole('tab',{name:'Decisions & delivery'})
    await user.click(screen.getByRole('button',{name:'Campus stories'}));await screen.findByRole('button',{name:'Deny brief'})
    await user.type(screen.getByLabelText('Comment / decision reason'),'Out of scope this term')
    await user.click(screen.getByRole('button',{name:'Deny brief'}))
    await user.click(within(await screen.findByRole('dialog',{name:'Deny this production request?'})).getByRole('button',{name:'Keep reviewing'}))
    await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());expect(screen.queryByText('Denied',{selector:'.production-status'})).not.toBeInTheDocument()
    await user.click(screen.getByRole('button',{name:'Deny brief'}))
    await user.click(within(await screen.findByRole('dialog',{name:'Deny this production request?'})).getByRole('button',{name:'Deny brief'}))
    expect(await screen.findByText('Denied',{selector:'.production-status'})).toBeInTheDocument()
  })
  it('lets configured Production leadership approve and confirms the proposed dates',async()=>{
    const user=userEvent.setup();renderPreview();await screen.findByRole('button',{name:'Campus stories'})
    await user.selectOptions(screen.getByRole('combobox',{name:/Preview account/}),'preview-reviewer');await screen.findByRole('tab',{name:'Decisions & delivery'})
    await user.click(screen.getByRole('button',{name:'Campus stories'}));await screen.findByRole('button',{name:'Approve & confirm dates'})
    expect(screen.getByRole('button',{name:'Deny brief'})).toBeDisabled()
    await user.click(screen.getByRole('button',{name:'Approve & confirm dates'}))
    await user.click(within(await screen.findByRole('dialog',{name:'Approve this brief?'})).getByRole('button',{name:'Approve & confirm dates'}));await screen.findByText(/^Confirmed shoot:/,{selector:'.production-review p'})
    expect(screen.getByText('Brief approved. Shoot dates are confirmed.',{selector:'.ws-toast p'})).toBeInTheDocument()
    expect(screen.getByText('Approved',{selector:'.production-status'})).toBeInTheDocument()
    await user.click(screen.getByRole('tab',{name:'Decisions & delivery'}));await screen.findByRole('heading',{name:'Decisions'})
    expect(await screen.findByText('Decision email: 2 sent')).toBeInTheDocument()
  })
  it('exposes access settings only to administrators and persists reviewer selection',async()=>{
    const user=userEvent.setup();renderPreview();await screen.findByRole('button',{name:'Campus stories'})
    expect(screen.queryByRole('tab',{name:'Production roles'})).not.toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox',{name:/Preview account/}),'preview-admin');await user.click(await screen.findByRole('tab',{name:'Production roles'}))
    const reviewer=await screen.findByRole('checkbox',{name:'Production leadership: Alex (Client Services)'});await user.click(reviewer)
    await user.click(screen.getByRole('button',{name:'Save settings'}));expect(await screen.findByText('Production access and notification settings saved.')).toBeInTheDocument();expect(screen.getByText('All changes saved',{selector:'.production-settings-savebar span'})).toHaveClass('production-saved-pulse')
    await user.selectOptions(screen.getByRole('combobox',{name:/Preview account/}),'preview-author');await screen.findByRole('tab',{name:'Decisions & delivery'})
    expect(screen.queryByRole('tab',{name:'Production roles'})).not.toBeInTheDocument()
  })
  it('never substitutes preview records when an authenticated service request fails',async()=>{
    vi.useFakeTimers()
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:503})))
    render(<AppSessionProvider value={{email:'member@example.org',isAdmin:false,setEmail:vi.fn(),setIsAdmin:vi.fn(),mode:'authenticated',getAccessToken:async()=> 'token',organizations:[{id:'11111111-1111-4111-8111-111111111111',name:'Real org',slug:'real',role:'member'}]}}><Production /></AppSessionProvider>)
    await act(async()=>{await vi.advanceTimersByTimeAsync(7100)})
    expect(screen.getByText(/StudioStack is temporarily unavailable/).closest('[role="alert"]')).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'Campus stories'})).not.toBeInTheDocument()
    expect(screen.queryByText(/Local preview/)).not.toBeInTheDocument()
  })
})

it('protects unsaved brief edits during app navigation while permitting step changes',async()=>{
  const user=userEvent.setup();renderPreview();await screen.findByRole('button',{name:'Campus stories'});
  await user.click(screen.getByRole('button',{name:'New brief'}));await screen.findByRole('heading',{name:'New production brief'});
  await user.type(screen.getByLabelText('Project name (required)'),'Unfinished production');
  const confirm=vi.fn(()=>false);vi.stubGlobal('confirm',confirm);
  const steps=within(screen.getByRole('navigation',{name:'Brief steps'}));await user.click(steps.getByRole('button',{name:/Project overview/}));await user.click(steps.getByRole('button',{name:/Basics/}));expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  const destination=document.createElement('a');destination.href='/inventory/';document.body.append(destination);
  try{
    const event=new MouseEvent('click',{bubbles:true,cancelable:true,button:0});expect(destination.dispatchEvent(event)).toBe(false)
    const dialog=await screen.findByRole('dialog',{name:'Discard unsaved changes?'});expect(confirm).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button',{name:'Keep editing'}));await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByLabelText('Project name (required)')).toHaveValue('Unfinished production')
    await user.click(screen.getByRole('button',{name:/Back to briefs/}));await user.click(within(await screen.findByRole('dialog',{name:'Discard unsaved changes?'})).getByRole('button',{name:'Discard changes'}))
    await waitFor(()=>expect(screen.queryByRole('heading',{name:'New production brief'})).not.toBeInTheDocument())
  }finally{destination.remove()}
})

it('lets a preview Production Lead save confirmed crew on an approved shoot',async()=>{
 const api=createPreviewProductionClient('preview-reviewer'),brief=await api.get('preview-brief');await api.action(brief.id,{action:'approve',version:brief.version,requestId:crypto.randomUUID()});
 const user=userEvent.setup();renderPreview();await screen.findByRole('button',{name:'Campus stories'});
 await user.selectOptions(screen.getByRole('combobox',{name:'Preview account'}),'preview-reviewer');await user.click(await screen.findByRole('button',{name:'Campus stories'}));
 const save=await screen.findByRole('button',{name:'Save crew assignments'});await waitFor(()=>expect(save).toBeEnabled());await user.click(screen.getByRole('checkbox',{name:'Alex (Client Services)'}));await user.click(save);
 await waitFor(async()=>expect((await api.get(brief.id)).crew).toContainEqual(expect.objectContaining({userId:'preview-author'})));
})

it('converts a selected pitch into a visible draft with its client account',async()=>{
 const lead=createPreviewProductionClient('preview-reviewer'),idea=await lead.createIdea({id:crypto.randomUUID(),title:'Example selected pitch',pitch:'An example story.',clientAccountId:'preview-client'});await lead.updateIdea(idea.id,{title:idea.title,pitch:idea.pitch,clientAccountId:idea.clientAccountId,status:'selected',version:idea.version});
 const user=userEvent.setup();renderPreview();await user.click(await screen.findByRole('tab',{name:'Ideas & pitches'}));await user.click(await screen.findByRole('button',{name:'Create brief from pitch'}));
 expect(await screen.findByLabelText('Project name (required)')).toHaveValue(idea.title);expect(screen.getByLabelText('Client (required)')).toHaveValue('Example client');expect(screen.getByLabelText('Client account')).toHaveValue('preview-client');
})

it('creates and selects a client inside a brief without saving or discarding other draft edits',async()=>{
 const user=userEvent.setup();renderPreview();await user.click(await screen.findByRole('button',{name:'New brief'}));
 expect(screen.queryByRole('button',{name:'Add client'})).not.toBeInTheDocument();
 await user.selectOptions(screen.getByRole('combobox',{name:'Preview account'}),'preview-reviewer');
 await user.click(await screen.findByRole('button',{name:'New brief'}));
 await user.type(await screen.findByLabelText('Project name (required)'),'Example unsaved client brief');
 await user.click(screen.getByRole('button',{name:'Add client'}));
 await user.type(screen.getByLabelText('New client account name'),'Example inline client{Enter}');
 await waitFor(()=>expect(screen.getByLabelText('Client account')).toHaveDisplayValue('Example inline client'));
 expect(screen.getByLabelText('Client (required)')).toHaveValue('Example inline client');
 expect(screen.getByLabelText('Project name (required)')).toHaveValue('Example unsaved client brief');
 expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
 const api=createPreviewProductionClient('preview-reviewer'),unsaved=(await api.list()).items.find(b=>b.status==='draft'&&b.ownerId==='preview-reviewer')!;
 expect(unsaved.data.projectName).toBe('');expect(unsaved.data.clientAccountId).toBeFalsy();
 await user.click(screen.getByRole('button',{name:'Save draft'}));await screen.findByText('All changes saved');
 expect((await api.get(unsaved.id)).data).toMatchObject({projectName:'Example unsaved client brief',client:'Example inline client',clientAccountId:expect.any(String)});
})

it('puts file controls in their matching guided steps and keeps draft text across steps',async()=>{
 const user=userEvent.setup();renderPreview();await user.click(await screen.findByRole('button',{name:'New brief'}));
 const step=(name:string)=>user.click(within(screen.getByRole('navigation',{name:'Brief steps'})).getByRole('button',{name:new RegExp(name)}));
 expect(screen.getByRole('link',{name:'Official production template 1'})).toBeVisible();
 await step('Project overview');expect(screen.getByRole('button',{name:'Upload Creative brief (PDF)'})).toBeVisible();await user.type(screen.getByLabelText('Project summary (required)'),'An example brief summary.');
 await step('Creative direction');for(const name of ['Storyboard (optional)','Other references','Brand guidelines','Logos, graphics & lower thirds'])expect(screen.getByRole('button',{name:`Upload ${name}`})).toBeVisible();
 expect(screen.queryByRole('button',{name:'Upload Creative brief (PDF)'})).not.toBeInTheDocument();
 await step('Paperwork');for(const name of ['Location permission / shoot agreement','Signed release forms','Shot list','Signed consent forms'])expect(screen.getByRole('button',{name:`Upload ${name}`})).toBeVisible();
 expect(screen.getByLabelText('Permits required?')).toBeVisible();expect(screen.getByLabelText('Who provides releases?')).toBeVisible();
 await step('Project overview');expect(screen.getByLabelText('Project summary (required)')).toHaveValue('An example brief summary.');
 expect(within(screen.getByRole('navigation',{name:'Brief steps'})).queryByRole('button',{name:/Attachments/})).not.toBeInTheDocument();
})
