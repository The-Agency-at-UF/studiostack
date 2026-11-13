/** Collection shapes for the local preview data adapter. */
export interface Timestamp {
  seconds?: number
  toDate(): Date
}

interface Equipment {
  id: string
  name: string
}

interface InventoryData {
  name: string
  category: string
  availability: string
  /** Private S3 object key, not a public bucket URL or an expiring signed URL. */
  photoKey?: string
  timestamp?: Timestamp
}

interface ReservationData {
  name: string
  userEmail: string
  team: string
  startDate: Timestamp
  endDate: Timestamp
  verifiedBy: Timestamp
  equipmentIDs: Equipment[]
  checkedOutItems: Equipment[]
  checkedInItems: Equipment[]
  overdueItems: (Equipment & { time: Timestamp })[]
}

interface ReportData {
  item: string
  itemId: string
  subject: string
  user: string
  message: string
  resolved: boolean
  timestamp: Timestamp
  resolvedBy?: string
  resolvedOn?: Timestamp
}

interface BugReportData {
  title: string
  description: string
  userEmail: string
  url: string
  timestamp: Timestamp
  status: string
}
export interface CollectionData {
  inventory: InventoryData
  reservations: ReservationData
  reports: ReportData
  bugReports: BugReportData
  featureRequests: BugReportData
}
