import {render,screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {describe,expect,it,vi} from 'vitest'
import ClientAccounts from './ClientAccounts'
import type {ProductionClient} from '../../api/production'

const clients=[{id:'b',name:'Spring Gala',version:2,archivedAt:'2026-01-01T00:00:00Z'},{id:'a',name:'Athletics',version:1,archivedAt:null}]

describe('ClientAccounts',()=>{
  it('lists active clients before archived ones and archives by name',async()=>{
    const updateClient=vi.fn().mockResolvedValue({}),onRefresh=vi.fn().mockResolvedValue(undefined)
    render(<ClientAccounts clients={clients} api={{updateClient} as unknown as ProductionClient} canManage onRefresh={onRefresh}/>)
    expect(screen.getByText('1 active · 1 archived')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').map(li=>li.textContent)).toEqual([expect.stringContaining('Athletics'),expect.stringContaining('Spring Gala')])
    await userEvent.click(screen.getByRole('button',{name:'Archive Athletics'}))
    expect(updateClient).toHaveBeenCalledWith('a',{name:'Athletics',archived:true,version:1})
    expect(screen.getByRole('button',{name:'Restore Spring Gala'})).toBeInTheDocument()
  })
  it('explains who adds clients when the viewer cannot manage them',()=>{
    render(<ClientAccounts clients={[]} api={{} as ProductionClient} canManage={false} onRefresh={vi.fn()}/>)
    expect(screen.getByText('No client accounts yet')).toBeInTheDocument()
    expect(screen.getByText(/Production Leads and administrators add client accounts/)).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'Add client account'})).not.toBeInTheDocument()
  })
})
