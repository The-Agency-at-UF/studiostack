import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { describe, expect, it } from 'vitest'
import Organization from './Organization'

describe('Organization preview', () => {
  it('opens settings directly from the account settings route', () => {
    render(<Organization isAdmin initialTab="settings" />)
    expect(screen.getByLabelText('Organization name')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps dialogs open in strict mode and restores keyboard focus', async () => {
    const user = userEvent.setup()
    render(<StrictMode><Organization isAdmin /></StrictMode>)
    const trigger = screen.getByRole('button', { name: 'Invite member' })
    await user.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Invite a member' })).toBeInTheDocument()
    expect(screen.getByLabelText('Full name')).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('labels the prototype and restricts the admin preview', () => {
    const { rerender } = render(<Organization isAdmin={true} />)
    expect(screen.getByText('UI preview')).toBeInTheDocument()
    expect(screen.getByText(/Changes reset on refresh/)).toBeInTheDocument()
    rerender(<Organization isAdmin={false} />)
    expect(screen.getByText(/must be an admin/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Invite member' })).not.toBeInTheDocument()
  })

  it('searches and filters members', async () => {
    const user = userEvent.setup()
    render(<Organization isAdmin />)
    await user.type(screen.getByRole('textbox', { name: 'Search members' }), 'jamie')
    expect(screen.getByText('Jamie Park')).toBeInTheDocument()
    expect(screen.queryByText('Morgan Lee')).not.toBeInTheDocument()
    await user.clear(screen.getByRole('textbox', { name: 'Search members' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by status' }), 'Invited')
    expect(screen.getByText('Taylor Chen')).toBeInTheDocument()
    expect(screen.queryByText('Jamie Park')).not.toBeInTheDocument()
  })

  it('creates a preview invitation only in the selected organization', async () => {
    const user = userEvent.setup()
    render(<Organization isAdmin />)
    await user.click(screen.getByRole('button', { name: 'Invite member' }))
    const dialog = screen.getByRole('dialog', { name: 'Invite a member' })
    await user.type(within(dialog).getByLabelText('Full name'), 'Avery Test')
    await user.type(within(dialog).getByLabelText('Email address'), 'avery@example.com')
    await user.click(within(dialog).getByRole('button', { name: 'Create preview invitation' }))
    expect(screen.getByText('Avery Test')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('No email was sent')
    await user.selectOptions(screen.getByLabelText('Preview organization'), 'northline')
    expect(screen.queryByText('Avery Test')).not.toBeInTheDocument()
    expect(screen.getByText('Sam Ellis')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Preview organization'), 'uf')
    expect(screen.getByText('Avery Test')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Activity' }))
    expect(screen.getByText(/Preview invitation created for Avery Test/)).toBeInTheDocument()
  })

  it('rejects duplicate organization invitations', async () => {
    const user = userEvent.setup()
    render(<Organization isAdmin />)
    await user.click(screen.getByRole('button', { name: 'Invite member' }))
    await user.type(screen.getByLabelText('Full name'), 'Duplicate')
    await user.type(screen.getByLabelText('Email address'), 'MORGAN@example.com')
    await user.click(screen.getByRole('button', { name: 'Create preview invitation' }))
    expect(screen.getByRole('alert')).toHaveTextContent('already in this organization')
  })

  it('protects the last active administrator from demotion and suspension', async () => {
    const user = userEvent.setup()
    render(<Organization isAdmin />)
    await user.click(screen.getByRole('button', { name: 'Change role for Morgan Lee' }))
    await user.selectOptions(screen.getByLabelText('Organization role'), 'Member')
    await user.click(screen.getByRole('button', { name: 'Save role' }))
    expect(screen.getByRole('alert')).toHaveTextContent('at least one active administrator')
    await user.click(screen.getByRole('button', { name: 'Close dialog' }))
    await user.click(screen.getByRole('button', { name: 'Suspend Morgan Lee' }))
    await user.click(screen.getByRole('button', { name: 'Confirm preview change' }))
    expect(screen.getByRole('alert')).toHaveTextContent('at least one active administrator')
  })

  it('groups administrators above members', () => {
    render(<Organization isAdmin />)
    expect(within(screen.getByRole('region', { name: 'Admin' })).getByText('Morgan Lee')).toBeInTheDocument()
    const members = within(screen.getByRole('region', { name: 'Members' }))
    expect(members.getByText('Alex Rivera')).toBeInTheDocument()
    expect(members.queryByText('Morgan Lee')).not.toBeInTheDocument()
  })

  it('moves a promoted member into the Admin section, then suspends or restores them', async () => {
    const user = userEvent.setup()
    render(<Organization isAdmin />)
    await user.click(screen.getByRole('button', { name: 'Change role for Alex Rivera' }))
    await user.selectOptions(screen.getByLabelText('Organization role'), 'Administrator')
    await user.click(screen.getByRole('button', { name: 'Save role' }))
    expect(within(screen.getByRole('region', { name: 'Members' })).queryByText('Alex Rivera')).not.toBeInTheDocument()
    const row = within(screen.getByRole('region', { name: 'Admin' })).getByText('Alex Rivera').closest('li')!
    await user.click(screen.getByRole('button', { name: 'Suspend Alex Rivera' }))
    await user.click(screen.getByRole('button', { name: 'Confirm preview change' }))
    expect(within(row).getByText('Suspended')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Restore Alex Rivera' }))
    await user.click(screen.getByRole('button', { name: 'Confirm preview change' }))
    expect(within(row).getByText('Active')).toBeInTheDocument()
  })

  it('revokes an invitation after confirmation', async () => {
    const user = userEvent.setup()
    render(<Organization isAdmin />)
    await user.click(screen.getByRole('button', { name: 'Revoke invitation for Taylor Chen' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Taylor Chen')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Revoke invitation for Taylor Chen' }))
    await user.click(screen.getByRole('button', { name: 'Confirm preview change' }))
    expect(screen.queryByText('Taylor Chen')).not.toBeInTheDocument()
  })

  it('saves preview settings without modifying another organization', async () => {
    const user = userEvent.setup()
    render(<Organization isAdmin />)
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.clear(screen.getByLabelText('Organization name'))
    await user.type(screen.getByLabelText('Organization name'), 'UF Preview Studio')
    await user.click(screen.getByRole('button', { name: 'Save preview settings' }))
    expect(screen.getByRole('heading', { name: 'UF Preview Studio' })).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Preview organization'), 'northline')
    expect(screen.getByLabelText('Organization name')).toHaveValue('Northline Studio')
    expect(screen.getByText('Not connected')).toBeInTheDocument()
  })
})
