import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Header from '../components/Header'

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn() }),
}))

describe('StudioStack application shell', () => {
  it('connects the admin navigation to the live routes', () => {
    render(<Header isAdmin logOut={vi.fn()} />)

    expect(screen.getByAltText('StudioStack')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Inventory' })).toHaveAttribute('href', '/inventory')
    expect(screen.getByRole('link', { name: 'Statistics' })).toHaveAttribute('href', '/statistics')
  })
})
