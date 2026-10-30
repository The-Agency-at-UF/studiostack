import {cleanup,render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import LiveAlerts from './Alerts'
const m=vi.hoisted(()=>({list:vi.fn(),preferences:vi.fn(),update:vi.fn(),read:vi.fn(),push:vi.fn(),api:{} as Record<string,unknown>}))
m.api={alerts:()=>({list:m.list,preferences:m.preferences,updatePreferences:m.update,read:m.read})}
vi.mock('./live',async()=>({...await vi.importActual('./live'),useLiveOrganization:()=>({api:m.api,organization:{id:'org'}})}))
vi.mock('next/navigation',()=>({useRouter:()=>({push:m.push})}))
const target='/check-in-out/?reservation=11111111-1111-4111-8111-111111111111',row={id:'alert',kind:'overdue_equipment',title:'Return overdue',message:'Return the camera.',targetPath:target,readAt:null,createdAt:'2026-10-28T12:00:00Z',emailStatus:'skipped'}
beforeEach(()=>{vi.clearAllMocks();m.list.mockResolvedValue({items:[row],nextCursor:null});m.preferences.mockResolvedValue({equipmentEmail:false,version:0});m.read.mockResolvedValue({...row,readAt:'2026-10-28T13:00:00Z'});m.update.mockResolvedValue({equipmentEmail:true,version:1})})
afterEach(cleanup)
describe('Personal alert workspace',()=>{
 it('defaults email off and saves explicit opt-in with its version',async()=>{const u=userEvent.setup();render(<LiveAlerts/>);const check=await screen.findByRole('checkbox',{name:'Email me about equipment alerts'});await waitFor(()=>expect(check).toBeEnabled());expect(check).not.toBeChecked();await u.click(check);await waitFor(()=>expect(m.update).toHaveBeenCalledWith({equipmentEmail:true,version:0}));expect(check).toBeChecked()})
 it('marks only the selected alert read before following its internal link',async()=>{const u=userEvent.setup();render(<LiveAlerts/>);await u.click(await screen.findByRole('button',{name:'Open'}));await waitFor(()=>expect(m.push).toHaveBeenCalledWith(target));expect(m.read).toHaveBeenCalledWith('alert')})
 it('removes read alerts from the unread view',async()=>{const u=userEvent.setup();render(<LiveAlerts/>);await u.click(await screen.findByRole('button',{name:'Mark read'}));await u.click(screen.getByRole('checkbox',{name:'Unread only'}));expect(screen.queryByText('Return overdue')).not.toBeInTheDocument();expect(screen.getByText('You’re caught up.')).toBeInTheDocument()})
 it('retains unread state on failure and does not navigate',async()=>{m.read.mockRejectedValue(new Error('private'));const u=userEvent.setup();render(<LiveAlerts/>);await u.click(await screen.findByRole('button',{name:'Open'}));expect(await screen.findByRole('alert')).toHaveTextContent('service is unavailable');expect(m.push).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'Mark read'})).toBeInTheDocument()})
})
