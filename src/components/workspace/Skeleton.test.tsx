import {cleanup,render,screen} from '@testing-library/react'
import {afterEach,describe,expect,it} from 'vitest'
import {Skeleton} from './WorkspaceUI'
afterEach(cleanup)
describe('Skeleton',()=>{
  it('announces its label and hides the placeholder blocks',()=>{
    const {container}=render(<Skeleton label="Loading reports…" variant="row" count={4}/>)
    const status=screen.getByRole('status')
    expect(status.textContent).toBe('Loading reports…')
    expect(status.className).toContain('ws-skeleton-row')
    const blocks=container.querySelectorAll('.ws-skeleton-block')
    expect(blocks).toHaveLength(4)
    blocks.forEach(block=>expect(block.getAttribute('aria-hidden')).toBe('true'))
  })
})
