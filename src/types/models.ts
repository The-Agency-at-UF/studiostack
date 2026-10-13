/** Shared contracts for the active web application and its local data adapter. */
export interface Timestamp {
  seconds?: number
  toDate(): Date
}

export interface Equipment {
  id: string
  name: string
}

export interface InventoryData {
  name: string
  category: string
  availability: string
  timestamp?: Timestamp
}
export type InventoryItem = InventoryData & { id: string }
export type ReservableEquipment = InventoryData & { equipmentID: string }

export interface ReservationData {
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
export type Reservation = ReservationData & { reservationId: string }

export interface ReportData {
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
export type EquipmentReport = ReportData & { reportID: string }

export interface NotificationData {
  userEmail: string
  type: 'report' | 'overdue'
  time: Timestamp
  userClosed: boolean
  adminClosed: boolean
  resolved?: boolean
  resolvedBy?: string
  item?: string
  itemId?: string
  amount?: number
  reservationName?: string
}
export type AppNotification = NotificationData & { id: string }

export interface UserData {
  isAdmin: boolean
  reservations?: Timestamp[]
}
export type AppUser = UserData & { email: string }
export interface TeamData { type: string }
export type Team = TeamData & { name: string }

export interface MailData {
  to: string
  message: { subject: string; html: string }
  type?: { subject: string }
  delivery?: { startTime: Timestamp }
}
export interface BugReportData {
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
  notifications: NotificationData
  users: UserData
  teams: TeamData
  mail: MailData
  bugReports: BugReportData
}

export interface AlertMessage { text: string; type: 'success' | 'error' }
export interface SelectOption<T = string> { value: T; label: string }
export interface ChartValue { name: string; value: number }
export interface ChartRecord { name: string; time: Date }
export interface OverdueEquipment extends Equipment { user: string }
export interface OverdueTime { user: string; id: string; time: string; totalMinutes: number }
export interface OverdueRecord {
  user: string
  numberOfOverdueEquipment: number
  overdueTimes: { converted: string; total: number }[]
  avgTime: string
  overdueTimesDisplay: string
}
