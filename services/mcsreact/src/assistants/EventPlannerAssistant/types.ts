// Define a Vendor interface
export interface Vendor {
  id: string;
  name: string;
  type: string;
  status: string;
  contractSigned: boolean;
  paymentStatus: string;
}

// Define BudgetCategory interface
export interface BudgetCategory {
  name: string;
  amount: number;
  spent?: number;
}

// Define BudgetData interface
export interface BudgetData {
  totalBudget: number;
  spent: number;
  remaining: number;
  categories: BudgetCategory[];
}

// Define Attendee interface
export interface Attendee {
  id: string;
  name: string;
  email: string;
  status: string;
  dietaryRestrictions: string;
  checkedIn: boolean;
}

// Define AttendeeStats interface
export interface AttendeeStats {
  totalInvited: number;
  confirmed: number;
  pending: number;
  declined: number;
  checkedIn: number;
}

// Define Task interface
export interface Task {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
  assignedTo: string;
}

// Define Venue interface
export interface Venue {
  id: string;
  name: string;
  capacity: number;
  price: number;
  location: string;
  amenities: string[];
  rating: number;
}

// Define VendorStatus interface for RealTimeEventMonitor
export interface VendorStatus {
  id: string;
  name: string;
  status: string;
  arrivalTime: string;
  actualTime: string;
}

// Define AttendeeCheckInStats interface for RealTimeEventMonitor
export interface AttendeeCheckInStats {
  expected: number;
  checkedIn: number;
  remaining: number;
  checkInRate: string;
}

// Define Document interface
export interface Document {
  id: string;
  name: string;
  type: string;
  size: string;
  uploaded: string;
}

// Define KeyMetric interface
export interface KeyMetric {
  name: string;
  value: string;
}

// Define AnalyticsData interface
export interface AnalyticsData {
  overallRating: number;
  attendeeSatisfaction: number;
  budgetAccuracy: number;
  vendorPerformance: number;
  feedbackCount: number;
  keyMetrics: KeyMetric[];
}
