import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Spotlight from './Spotlight'
import type { TourStep } from './Spotlight'

// happy-dom has no layout, so anchors marked data-hidden measure as zero-sized.
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return (this.dataset.hidden ? new DOMRect(0, 0, 0, 0) : new DOMRect(10, 10, 100, 40))
  })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

const steps: TourStep[] = [
  { id: 'welcome', title: 'Welcome', body: 'Hello' },
  { id: 'menu', target: ['sidebar', 'menu'], title: 'Menu', body: 'Navigate' },
  { id: 'missing', target: 'nowhere', title: 'Missing', body: 'Never shown' },
  { id: 'done', title: 'Done', body: 'Bye' },
]
function Anchors() { return <><div data-tour="sidebar" data-hidden="1">Sidebar</div><button data-tour="menu">Menu</button></> }

describe('Spotlight', () => {
  it('walks visible steps, skips missing anchors and finishes', async () => {
    const user = userEvent.setup(), onFinish = vi.fn(), onSkip = vi.fn()
    render(<><Anchors /><Spotlight steps={steps} onFinish={onFinish} onSkip={onSkip} /></>)
    expect(screen.getByRole('dialog', { name: 'Welcome' })).toHaveTextContent('Step 1 of 3')
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('dialog', { name: 'Menu' })).toHaveTextContent('Step 2 of 3')
    expect(document.querySelector('.tour-spotlight')).toHaveStyle({ top: '4px', left: '4px', width: '112px', height: '52px' })
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('dialog', { name: 'Done' })).toHaveTextContent('Step 3 of 3')
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('dialog', { name: 'Menu' })).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' })
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    expect(onFinish).toHaveBeenCalledOnce(); expect(onSkip).not.toHaveBeenCalled()
  })

  it.each([['Skip tour'], ['Close tour']])('%s skips the tour', async name => {
    const onSkip = vi.fn()
    render(<Spotlight steps={steps} onFinish={vi.fn()} onSkip={onSkip} />)
    await userEvent.setup().click(screen.getByRole('button', { name }))
    expect(onSkip).toHaveBeenCalledOnce()
  })

  it('skips on Escape and returns focus to the control that was focused', () => {
    const onSkip = vi.fn()
    const { rerender } = render(<button>Before</button>)
    screen.getByRole('button', { name: 'Before' }).focus()
    rerender(<><button>Before</button><Spotlight steps={steps} onFinish={vi.fn()} onSkip={onSkip} /></>)
    expect(screen.getByRole('button', { name: 'Next' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onSkip).toHaveBeenCalledOnce()
    rerender(<button>Before</button>)
    expect(screen.getByRole('button', { name: 'Before' })).toHaveFocus()
  })

  it('blocks clicks on the workspace behind the tour', () => {
    render(<Spotlight steps={steps} onFinish={vi.fn()} onSkip={vi.fn()} />)
    expect(document.querySelector('.tour-layer')?.parentElement).toBe(document.body)
    expect(document.querySelector('.tour-backdrop')).toBeInTheDocument()
  })
})
