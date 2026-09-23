import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getDocs } from 'firebase/firestore'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

describe('StudioStack application shell', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('email', 'integration@ufl.edu')
    localStorage.setItem('isAdmin', 'true')
    vi.mocked(getDocs).mockResolvedValue({ docs: [] })
  })

  it('navigates from the dashboard to inventory', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(await screen.findByAltText('StudioStack')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Inventory' }))

    expect(await screen.findByRole('heading', { name: 'Inventory' })).toBeInTheDocument()
  })
})
