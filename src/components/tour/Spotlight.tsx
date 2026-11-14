'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { HiOutlineXMark } from 'react-icons/hi2'
import '../../styles/tour.css'

export type TourStep = { id: string; target?: string | string[]; title: string; body: string }
type Props = { steps: TourStep[]; onFinish: () => void; onSkip: () => void }
type Box = { top: number; left: number; width: number; height: number; tracking?: boolean }

const GAP = 12, MARGIN = 16, PAD = 6
const visible = (element: Element) => { const box = element.getBoundingClientRect(); return box.width > 0 && box.height > 0 }
/** A step may name several anchors; the first one on screen wins, so the mobile menu button can stand in for the sidebar. */
function findTarget(target: TourStep['target']) {
  for (const id of [target ?? []].flat()) for (const element of document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`)) if (visible(element)) return element
  return null
}
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max))

function cardPosition(target: Box | null, card: { width: number; height: number }): CSSProperties | undefined {
  if (!target) return undefined
  const width = window.innerWidth, height = window.innerHeight
  const top = clamp(target.top, MARGIN, height - card.height - MARGIN), left = clamp(target.left, MARGIN, width - card.width - MARGIN)
  if (target.left + target.width + GAP + card.width + MARGIN <= width) return { top, left: target.left + target.width + GAP }
  if (target.top + target.height + GAP + card.height + MARGIN <= height) return { top: target.top + target.height + GAP, left }
  return { top: Math.max(MARGIN, target.top - GAP - card.height), left }
}

/** Dims the workspace, lights up one anchor at a time and explains it. Skipped steps never block the tour. */
export default function Spotlight({ steps, onFinish, onSkip }: Props) {
  // Anchors are checked as the tour moves, so lazily loaded controls still get their step.
  const available = (step: TourStep) => !step.target || !!findTarget(step.target)
  const seek = (from: number, direction: 1 | -1) => { for (let i = from; i >= 0 && i < steps.length; i += direction) if (available(steps[i])) return i; return -1 }
  const [index, setIndex] = useState(() => seek(0, 1)), [box, setBox] = useState<Box | null>(null), [cardSize, setCardSize] = useState({ width: 360, height: 220 })
  const cardRef = useRef<HTMLDivElement>(null), [previousFocus] = useState(() => document.activeElement)
  const step = steps[index], shown = steps.filter((s, i) => i === index || available(s)), nextIndex = seek(index + 1, 1), last = nextIndex < 0
  const next = () => { if (last) onFinish(); else setIndex(nextIndex) }
  const back = () => { const previous = seek(index - 1, -1); if (previous >= 0) setIndex(previous) }

  useEffect(() => () => { if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus() }, [previousFocus])
  useEffect(() => { if (index < 0) onFinish() }, [index, onFinish])

  useLayoutEffect(() => {
    if (!step) return
    const element = findTarget(step.target)
    element?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
    // Moving between steps glides; following a scroll or resize must not trail behind the page.
    const measure = (tracking = false) => {
      if (cardRef.current) setCardSize({ width: cardRef.current.offsetWidth || 360, height: cardRef.current.offsetHeight || 220 })
      if (!element) return setBox(null)
      const rect = element.getBoundingClientRect()
      setBox({ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2, tracking })
    }
    measure()
    cardRef.current?.querySelector<HTMLElement>('.tour-next')?.focus()
    const follow = () => measure(true)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => measure())
    if (element) observer?.observe(element)
    window.addEventListener('resize', follow); window.addEventListener('scroll', follow, true)
    return () => { observer?.disconnect(); window.removeEventListener('resize', follow); window.removeEventListener('scroll', follow, true) }
  }, [step])

  if (!step) return null
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); onSkip() }
    else if (event.key === 'ArrowRight') { event.preventDefault(); next() }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); back() }
    else if (event.key === 'Tab') {
      const controls = Array.from(cardRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [])
      const first = controls[0], end = controls[controls.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === cardRef.current)) { event.preventDefault(); end?.focus() }
      else if (!event.shiftKey && document.activeElement === end) { event.preventDefault(); first?.focus() }
    }
  }

  return createPortal(<div className="tour-layer" data-centered={box ? undefined : ''} data-tracking={box?.tracking ? '' : undefined}>
    {box ? <div className="tour-spotlight" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} aria-hidden="true" /> : <div className="tour-backdrop" aria-hidden="true" />}
    <div ref={cardRef} className="tour-card" style={cardPosition(box, cardSize)} role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body" tabIndex={-1} onKeyDown={onKeyDown}>
      <div className="tour-card-heading">
        <span className="tour-progress">Step {shown.indexOf(step) + 1} of {shown.length}</span>
        <button type="button" className="tour-close" aria-label="Close tour" onClick={onSkip}><HiOutlineXMark aria-hidden="true" /></button>
      </div>
      <h2 id="tour-title">{step.title}</h2>
      <p id="tour-body">{step.body}</p>
      <ol className="tour-dots" aria-hidden="true">{shown.map((s, i) => <li key={s.id} className={s === step ? 'is-current' : i < shown.indexOf(step) ? 'is-done' : undefined} />)}</ol>
      <div className="tour-actions">
        <button type="button" className="tour-skip" onClick={onSkip}>Skip tour</button>
        <span>
          {seek(index - 1, -1) >= 0 && <button type="button" className="tour-back" onClick={back}>Back</button>}
          <button type="button" className="tour-next" onClick={next}>{last ? 'Finish' : 'Next'}</button>
        </span>
      </div>
    </div>
  </div>, document.body)
}
