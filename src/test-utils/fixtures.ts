import type { CollectionData, Timestamp } from '../types/models'
import type { DocumentSnapshot } from '../data/localStore'

const timestamp: Timestamp = { seconds: 0, toDate: () => new Date(0) }
const defaults: CollectionData = {
  inventory: { name: 'Camera', category: 'Camera & Accessories', availability: 'available' },
  reservations: {
    name: 'Test reservation', userEmail: 'test@ufl.edu', team: 'Test team',
    startDate: timestamp, endDate: timestamp, verifiedBy: timestamp,
    equipmentIDs: [], checkedOutItems: [], checkedInItems: [], overdueItems: [],
  },
  reports: {
    item: 'Camera', itemId: 'camera-1', subject: 'Other', user: 'test@ufl.edu',
    message: 'Test report', resolved: false, timestamp,
  },
  notifications: { userEmail: 'test@ufl.edu', type: 'overdue', time: timestamp, userClosed: false, adminClosed: false },
  users: { isAdmin: false },
  teams: { type: 'Internal' },
  mail: { to: 'test@ufl.edu', message: { subject: 'Test', html: '' } },
  bugReports: { title: 'Test', description: 'Test', userEmail: 'test@ufl.edu', url: '/', timestamp, status: 'Open' },
}

/** Complete typed fixtures while allowing each test to specify only relevant fields. */
export function mockDocument<K extends keyof CollectionData>(path: K, id: string, data: Partial<CollectionData[K]>): DocumentSnapshot<K> {
  return {
    id,
    ref: { kind: 'document', path, id },
    data: () => ({ ...defaults[path], ...data }),
  }
}
