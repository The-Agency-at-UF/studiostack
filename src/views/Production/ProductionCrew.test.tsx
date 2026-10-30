import {cleanup,render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach,describe,it,expect,vi} from 'vitest'
import ProductionCrew from './ProductionCrew'
import {emptyBrief,type ProductionBrief} from '../../types/production'
afterEach(cleanup)
const brief={id:'shoot',status:'approved',shootStartsAt:'2026-12-01T00:00:00Z',crew:[],data:emptyBrief()} as unknown as ProductionBrief
const people=[{id:'alex',displayName:'Alex',email:null,role:'member' as const,status:'active' as const}]
describe('Production crew permissions',()=>{
 it('lets leadership assign an active teammate with a shoot role',async()=>{const user=userEvent.setup(),save=vi.fn().mockResolvedValue(undefined);render(<ProductionCrew brief={brief} canAssign disabled={false} loadMembers={vi.fn().mockResolvedValue(people)} onAssign={save}/>);await user.click(await screen.findByRole('checkbox',{name:'Alex'}));await user.clear(screen.getByLabelText('Assignment for Alex'));await user.type(screen.getByLabelText('Assignment for Alex'),'Camera operator');await user.click(screen.getByRole('button',{name:'Save crew assignments'}));await waitFor(()=>expect(save).toHaveBeenCalledWith([{userId:'alex',role:'Camera operator'}]))})
 it('shows assigned crew to a member without offering assignment controls',()=>{const load=vi.fn();render(<ProductionCrew brief={{...brief,crew:[{userId:'alex',name:'Alex',role:'Producer'}]}} canAssign={false} disabled={false} loadMembers={load} onAssign={vi.fn()}/>);expect(screen.getByText('Alex · Producer')).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Save crew assignments'})).not.toBeInTheDocument();expect(load).not.toHaveBeenCalled()})
 it('requires an approved and dated shoot before showing assignment controls',()=>{render(<ProductionCrew brief={{...brief,status:'submitted'}} canAssign disabled={false} loadMembers={vi.fn().mockResolvedValue(people)} onAssign={vi.fn()}/>);expect(screen.getByText('Awaiting approval')).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Save crew assignments'})).not.toBeInTheDocument()})
})
