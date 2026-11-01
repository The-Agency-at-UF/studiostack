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

  it('merges updates without dropping existing fields', async () => {
    const reference = await store.addDoc(store.collection(store.db, 'inventory'), { name: 'Camera', category: 'Camera', availability: 'available' })
    cleanup.push(() => store.deleteDoc(reference))
    await store.updateDoc(reference, { availability: 'maintenance' })
    const data = (await store.getDoc(reference)).data()
    expect(data).toMatchObject({ name: 'Camera', availability: 'maintenance' })
  })

  it('lists documents and reports missing ones', async () => {
    const inventory = store.collection(store.db, 'inventory')
    const newer = await store.addDoc(inventory, { name: 'Newer', category: 'Listing test', availability: 'available', timestamp: new Date(2000) })
    cleanup.push(() => store.deleteDoc(newer))
    const result = await store.getDocs(inventory)
    expect(result.docs.map(item => item.id)).toContain(newer.id)
    await store.deleteDoc(newer)
    const missing = await store.getDoc(newer)
    expect(missing.exists()).toBe(false)
    expect(missing.data()).toBeUndefined()
  })
})
