import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import ConfirmDialog from './ConfirmDialog'

afterEach(cleanup)

it('labels the dialog, focuses Cancel, handles Escape, and returns focus to the trigger', () => {
  const trigger = document.createElement('button')
  document.body.append(trigger)
  trigger.focus()
  const onCancel = vi.fn()
  const view = render(<ConfirmDialog title="Delete this brief?" subject="Campus stories" description="This action can’t be undone." confirmLabel="Delete brief" onCancel={onCancel} onConfirm={vi.fn()} />)
  const dialog = screen.getByRole('dialog', { name: 'Delete this brief?' })
  expect(dialog).toHaveAccessibleDescription('This action can’t be undone.')
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  fireEvent(dialog, new Event('cancel', { cancelable: true }))
  expect(onCancel).toHaveBeenCalledOnce()
  view.unmount()
  expect(trigger).toHaveFocus()
  trigger.remove()
})

it('prevents repeat submissions and dismissal while deletion is pending', async () => {
  const onConfirm = vi.fn(), onCancel = vi.fn()
  render(<ConfirmDialog title="Delete this brief?" description="This action can’t be undone." confirmLabel="Delete brief" busy onCancel={onCancel} onConfirm={onConfirm} />)
  expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'true')
  expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  await userEvent.setup().click(screen.getByRole('button', { name: 'Deleting…' }))
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  expect(onConfirm).not.toHaveBeenCalled()
  expect(onCancel).not.toHaveBeenCalled()
})
