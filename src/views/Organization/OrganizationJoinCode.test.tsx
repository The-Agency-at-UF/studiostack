import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AccountClient } from '../../api/accounts'
import OrganizationJoinCode from './OrganizationJoinCode'

const saved = { id: 'first', label: 'Agency code', code: 'ABCDE-FGHJK', uses: 0, version: 1, maxUses: null, expiresAt: null, revokedAt: null, createdAt: '' }
const client = (items = [saved]) => ({ joinCodes: vi.fn().mockResolvedValue({ items, nextCursor: null }), createJoinCode: vi.fn().mockResolvedValue(saved) })
function view(api: ReturnType<typeof client>) { return render(<OrganizationJoinCode api={api as unknown as AccountClient} name="The Agency at UF" />) }
afterEach(cleanup)
describe('Organization join code', () => {
  it('loads the saved code on each visit and copies it', async () => {
    const user = userEvent.setup(), api = client()
    const rendered = view(api)
    expect(await screen.findByText(saved.code)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Copy code' }))
    expect(await navigator.clipboard.readText()).toBe(saved.code)
    rendered.unmount(); view(api)
    expect(await screen.findByText(saved.code)).toBeInTheDocument()
    expect(api.createJoinCode).not.toHaveBeenCalled()
  })
  it('creates an unlimited reusable code and shows the saved result', async () => {
    const user = userEvent.setup(), api = client([])
    view(api)
    await user.click(await screen.findByRole('button', { name: 'Create reusable code' }))
    expect(await screen.findByText(saved.code)).toBeInTheDocument()
    expect(api.createJoinCode).toHaveBeenCalledWith(expect.objectContaining({ reusable: true, label: 'The Agency at UF join code' }))
  })
  it('confirms replacement and identifies the code being replaced', async () => {
    const user = userEvent.setup(), api = client()
    api.createJoinCode.mockResolvedValue({ ...saved, id: 'second', code: '12345-67890' })
    view(api)
    await user.click(await screen.findByRole('button', { name: 'Replace code' }))
    expect(api.createJoinCode).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Replace join code' }))
    expect(await screen.findByText('12345-67890')).toBeInTheDocument()
    expect(screen.queryByText(saved.code)).not.toBeInTheDocument()
    expect(api.createJoinCode).toHaveBeenCalledWith(expect.objectContaining({ reusable: true, replaces: 'first' }))
  })
  it('retries failed creation with the same request ID', async () => {
    const user = userEvent.setup(), api = client([])
    api.createJoinCode.mockRejectedValueOnce(new Error('network')).mockResolvedValue(saved)
    view(api)
    await user.click(await screen.findByRole('button', { name: 'Create reusable code' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be saved')
    await user.click(screen.getByRole('button', { name: 'Create reusable code' }))
    expect(await screen.findByText(saved.code)).toBeInTheDocument()
    expect(api.createJoinCode.mock.calls[0]).toEqual(api.createJoinCode.mock.calls[1])
  })
})
