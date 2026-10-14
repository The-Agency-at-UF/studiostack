import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Header from '../components/Header'
import Dashboard from '../views/Dashboard/Dashboard'

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn() }),
}))

describe('StudioStack application shell', () => {
  it('connects the admin navigation to the redesigned dashboard', async () => {
    render(
      <>
        <Header isAdmin logOut={vi.fn()} />
        <Dashboard isAdmin />
      </>,
    )

    expect(screen.getByAltText('StudioStack')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Keep the work moving/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Inventory' })).toHaveAttribute('href', '/inventory')
    expect(screen.getByRole('link', { name: 'Statistics' })).toHaveAttribute('href', '/statistics')
    expect(await screen.findByText('You have no notifications!')).toBeInTheDocument()
  })
})
