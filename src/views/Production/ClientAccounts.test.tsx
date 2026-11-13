import {render,screen,within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {describe,expect,it,vi} from 'vitest'
import ClientAccounts,{DeletedClientAccounts} from './ClientAccounts'
import {clientDeletable} from './clientPermissions'
import type {ProductionClient} from '../../api/production'

const clients=[{id:'b',name:'Spring Gala',version:2,createdBy:'lead',deletedAt:'2026-01-01T00:00:00Z'},{id:'a',name:'Athletics',version:1,createdBy:'lead',deletedAt:null},{id:'c',name:'Commencement',version:1,createdBy:null,deletedAt:null}]

describe('ClientAccounts',()=>{
  it('lets owners, administrators and the creator delete, and nobody else',()=>{
    expect(clientDeletable(clients[1],'lead',false)).toBe(true)
    expect(clientDeletable(clients[1],'someone',false)).toBe(false)
    expect(clientDeletable(clients[2],'lead',false)).toBe(false)
    expect(clientDeletable(clients[2],'someone',true)).toBe(true)
    expect(clientDeletable(clients[2],undefined,false)).toBe(false)
  })
  it('lists active clients and deletes only after confirmation',async()=>{
    const updateClient=vi.fn().mockResolvedValue({}),onRefresh=vi.fn().mockResolvedValue(undefined)
    render(<ClientAccounts clients={clients} api={{updateClient} as unknown as ProductionClient} canManage canDelete={c=>c.createdBy==='lead'} onRefresh={onRefresh}/>)
    expect(screen.getByText('2 active')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').map(li=>li.textContent)).toEqual([expect.stringContaining('Athletics'),expect.stringContaining('Commencement')])
    expect(screen.queryByRole('button',{name:'Delete Commencement'})).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button',{name:'Delete Athletics'}))
    const dialog=screen.getByRole('dialog')
    expect(within(dialog).getByText('Athletics')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button',{name:'Cancel'}))
    expect(updateClient).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button',{name:'Delete Athletics'}))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Delete client account'}))
    expect(updateClient).toHaveBeenCalledWith('a',{name:'Athletics',deleted:true,version:1})
    expect(onRefresh).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('explains who adds clients when the viewer cannot manage them',()=>{
    render(<ClientAccounts clients={[]} api={{} as ProductionClient} canManage={false} canDelete={()=>false} onRefresh={vi.fn()}/>)
    expect(screen.getByText('No client accounts yet')).toBeInTheDocument()
    expect(screen.getByText(/Production Leads and administrators add client accounts/)).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'Add client account'})).not.toBeInTheDocument()
  })
})
describe('DeletedClientAccounts',()=>{
  it('restores only the deleted accounts the viewer may restore',async()=>{
    const updateClient=vi.fn().mockResolvedValue({}),onRefresh=vi.fn().mockResolvedValue(undefined)
    const deleted=[...clients,{id:'d',name:'Alumni',version:3,createdBy:'other',deletedAt:'2026-02-01T00:00:00Z'}]
    render(<DeletedClientAccounts clients={deleted} api={{updateClient} as unknown as ProductionClient} canRestore={c=>c.createdBy==='lead'} onRefresh={onRefresh}/>)
    expect(screen.getAllByRole('listitem').map(li=>li.textContent)).toEqual([expect.stringContaining('Spring Gala')])
    await userEvent.click(screen.getByRole('button',{name:'Restore Spring Gala'}))
    expect(updateClient).toHaveBeenCalledWith('b',{name:'Spring Gala',deleted:false,version:2})
  })
  it('says when there is nothing to restore',()=>{
    render(<DeletedClientAccounts clients={clients.slice(1)} api={{} as ProductionClient} canRestore={()=>true} onRefresh={vi.fn()}/>)
    expect(screen.getByText('No deleted client accounts you can restore.')).toBeInTheDocument()
  })
})
describe('Optimistic client accounts',()=>{
  it('lists a new client while it saves and takes it back out if saving fails',async()=>{
    let fail!:(error:unknown)=>void;const createClient=vi.fn().mockReturnValue(new Promise((_,reject)=>{fail=reject}))
    render(<ClientAccounts clients={clients} api={{createClient} as unknown as ProductionClient} canManage canDelete={()=>true} onRefresh={vi.fn().mockResolvedValue(undefined)}/>)
    await userEvent.type(screen.getByLabelText('Client account name'),'Orientation');await userEvent.click(screen.getByRole('button',{name:'Add client account'}))
    expect(within(screen.getByText('Orientation').closest('li')!).getByText('Saving…')).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'Delete Orientation'})).not.toBeInTheDocument();expect(screen.getByLabelText('Client account name')).toHaveValue('')
    fail(new Error('offline'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Client account could not be saved.')
    expect(screen.queryByText('Orientation')).not.toBeInTheDocument();expect(screen.getByLabelText('Client account name')).toHaveValue('Orientation')
  })
  it('puts a deleted client back when the server rejects the delete',async()=>{
    const updateClient=vi.fn().mockRejectedValue(new Error('offline'))
    render(<ClientAccounts clients={clients} api={{updateClient} as unknown as ProductionClient} canManage canDelete={()=>true} onRefresh={vi.fn()}/>)
    await userEvent.click(screen.getByRole('button',{name:'Delete Athletics'}));await userEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Delete client account'}))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Athletics')).toBeInTheDocument();expect(screen.getByText('2 active')).toBeInTheDocument()
  })
})
