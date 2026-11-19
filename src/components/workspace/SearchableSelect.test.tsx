import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { SearchableSelect } from './SearchableSelect'

function Harness({ onChange = () => {} }: { onChange?: (v: string) => void }) {
  const [value, setValue] = useState('')
  return <SearchableSelect label="Client account" allLabel="All client accounts" value={value} onChange={v => { setValue(v); onChange(v) }} options={[['a', 'Athletics'], ['b', 'Business school'], ['c', 'Campus life']]} />
}

describe('SearchableSelect', () => {
  it('filters options by the search text and keeps the all choice', async () => {
    const user = userEvent.setup(); render(<Harness />)
    await user.click(screen.getByRole('button', { name: /Client account/ }))
    const search = screen.getByRole('combobox', { name: 'Search client account' })
    expect(search).toHaveFocus()
    await user.type(search, 'CAMP')
    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual(['All client accounts', 'Campus life'])
    await user.type(search, 'zzz')
    expect(screen.getByText('No matches')).toBeInTheDocument()
  })
  it('picks with the keyboard and returns focus to the trigger', async () => {
    const onChange = vi.fn(); const user = userEvent.setup(); render(<Harness onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: /Client account/ }))
    await user.type(screen.getByRole('combobox'), 'b{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledWith('b')
    const trigger = screen.getByRole('button', { name: /Client account/ })
    expect(trigger).toHaveTextContent('Business school'); expect(trigger).toHaveFocus()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
  it('closes on Escape without changing the value', async () => {
    const onChange = vi.fn(); const user = userEvent.setup(); render(<Harness onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: /Client account/ }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument(); expect(onChange).not.toHaveBeenCalled()
  })
})
