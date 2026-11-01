import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {Select} from './WorkspaceUI'
afterEach(cleanup)
describe('Select',()=>{
  it('renders a native select with the themed class and forwards props',()=>{
    const onChange=vi.fn()
    render(<label>Status<Select className="extra" value="b" onChange={onChange} aria-describedby="hint" required><option value="a">A</option><option value="b">B</option></Select></label>)
    const select=screen.getByRole('combobox',{name:'Status'}) as HTMLSelectElement
    expect(select.tagName).toBe('SELECT')
    expect(select.className).toBe('ws-select extra')
    expect(select.value).toBe('b')
    expect(select.getAttribute('aria-describedby')).toBe('hint')
    expect(select.required).toBe(true)
    fireEvent.change(select,{target:{value:'a'}})
    expect(onChange).toHaveBeenCalledTimes(1)
  })
  it('forwards disabled',()=>{
    render(<Select aria-label="Role" disabled><option>Member</option></Select>)
    expect((screen.getByRole('combobox',{name:'Role'}) as HTMLSelectElement).disabled).toBe(true)
  })
})
