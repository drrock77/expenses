export interface Transaction {
  id: string
  date: Date
  amount: number
  merchant: string
  category?: string
  description?: string
  receipt?: Receipt
  cardLastFour?: string
  status: 'unmatched' | 'matched' | 'submitted'
}

export interface Receipt {
  id: string
  fileName: string
  fileUrl?: string
  emailSubject?: string
  emailDate?: Date
  matchConfidence?: number
}

export interface ExpenseReport {
  id: string
  name: string
  startDate: Date
  endDate: Date
  transactions: Transaction[]
  perDiemItems: PerDiemItem[]
  totalAmount: number
  status: 'draft' | 'submitted' | 'approved' | 'rejected'
  concurId?: string
}

export interface PerDiemItem {
  id: string
  date: Date
  location: string
  lodgingRate: number
  mieRate: number
  totalAmount: number
  partialDay?: boolean
}

export interface TripInfo {
  id: string
  name: string
  startDate: Date
  endDate: Date
  locations: string[]
  attendees?: string[]
  purpose?: string
  source: 'calendar' | 'tripit' | 'manual'
}