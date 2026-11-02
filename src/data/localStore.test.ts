import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockDocument } from '../test-utils/fixtures'

// Component tests mock the adapter; these tests exercise its real implementation.
const store = await vi.importActual<typeof import('./localStore')>('./localStore')
const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map(remove => remove()))
})

describe('typed local store', () => {
  it('normalizes form dates into timestamps, including nested overdue equipment', async () => {
    const time = new Date('2026-10-01T12:00:00Z')
    const reference = await store.addDoc(store.collection(store.db, 'reservations'), {
      ...mockDocument('reservations', 'fixture', {}).data(),
      startDate: time,
      overdueItems: [{ id: 'camera', name: 'Camera', time }],
    })
    cleanup.push(() => store.deleteDoc(reference))
    const data = (await store.getDoc(reference)).data()
    expect(data?.startDate.toDate()).toEqual(time)
    expect(data?.overdueItems[0].time.toDate()).toEqual(time)
  })

  it('merges updates and normalizes array-union timestamps', async () => {
    const reference = await store.addDoc(store.collection(store.db, 'users'), { isAdmin: false })
    cleanup.push(() => store.deleteDoc(reference))
    const time = new Date('2026-10-01T13:00:00Z')
    await store.updateDoc(reference, { reservations: store.arrayUnion(time) })
    const data = (await store.getDoc(reference)).data()
    expect(data?.isAdmin).toBe(false)
    expect(data?.reservations?.[0].toDate()).toEqual(time)
  })

  it('preserves query filtering on live updates and unsubscribes cleanly', async () => {
    const inventory = store.collection(store.db, 'inventory')
    const listener = vi.fn()
    const unsubscribe = store.onSnapshot(store.query(inventory, store.where('category', '==', 'Audio')), listener)
    const camera = await store.addDoc(inventory, { name: 'Camera', category: 'Camera', availability: 'available' })
    const mic = await store.addDoc(inventory, { name: 'Microphone', category: 'Audio', availability: 'available' })
    cleanup.push(() => store.deleteDoc(camera), () => store.deleteDoc(mic))
    expect(listener.mock.lastCall?.[0].docs.map((item: { id: string }) => item.id)).toEqual([mic.id])
    unsubscribe()
    const calls = listener.mock.calls.length
    await store.updateDoc(mic, { name: 'Updated microphone' })
    expect(listener).toHaveBeenCalledTimes(calls)
  })

  it('sorts timestamps and reports missing documents', async () => {
    const inventory = store.collection(store.db, 'inventory')
    const older = await store.addDoc(inventory, { name: 'Older', category: 'Sorting test', availability: 'available', timestamp: new Date(1000) })
    const newer = await store.addDoc(inventory, { name: 'Newer', category: 'Sorting test', availability: 'available', timestamp: new Date(2000) })
    cleanup.push(() => store.deleteDoc(older), () => store.deleteDoc(newer))
    const result = await store.getDocs(store.query(inventory, store.where('category', '==', 'Sorting test'), store.orderBy('timestamp', 'desc')))
    expect(result.docs.map(item => item.id)).toEqual([newer.id, older.id])
    await store.deleteDoc(newer)
    const missing = await store.getDoc(newer)
    expect(missing.exists()).toBe(false)
    expect(missing.data()).toBeUndefined()
  })
})
