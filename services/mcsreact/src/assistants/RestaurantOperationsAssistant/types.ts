export interface Reservation {
  id: string;
  guestName: string;
  partySize: number;
  date: string;
  time: string;
  status: string;
  specialRequests: string;
}

export interface ReservationForTable {
  id: string;
  guestName: string;
  partySize: number;
  time: string;
}

export interface Table {
  tableNumber: string;
  capacity: number;
  status: string;
  currentReservation?: string;
  server?: string;
}

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  availability: string;
}

export interface Shift {
  id: string;
  staffId: string;
  date: string;
  startTime: string;
  endTime: string;
  role: string;
}

export interface OrderItem {
  name: string;
  quantity: number;
  status: string;
}

export interface Order {
  id: string;
  tableNumber: string;
  items: OrderItem[];
  status: string;
  priority: string;
  timestamp: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  currentQuantity: number;
  minQuantity: number;
  unit: string;
  lastRestocked: string;
}

export interface MenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
  description: string;
  available: boolean;
  ingredients: string;
}

export interface DailyRevenue {
  date: string;
  amount: number;
}

export interface RevenueCategory {
  category: string;
  amount: number;
}

export interface ExpenseCategory {
  category: string;
  amount: number;
}

export interface FinancialData {
  dailyRevenue: DailyRevenue[];
  revenueByCategory: RevenueCategory[];
  expenseBreakdown: ExpenseCategory[];
  profitMargin: number;
  averageTicketSize: number;
  tableTurnoverRate: number;
  laborCostPercentage: number;
  foodCostPercentage: number;
}

export interface FeedbackItem {
  id: string;
  guestName: string;
  rating: number;
  comments: string;
  date: string;
  responded: boolean;
  response?: string;
}

// Tool message content interfaces
export interface ToolMessageContent {
  tool: string;
  [key: string]: any; // Allow additional properties
}

export interface ReservationsToolContent extends ToolMessageContent {
  tool: 'ReservationsTool';
  reservations: Reservation[];
}

export interface TableManagementToolContent extends ToolMessageContent {
  tool: 'TableManagementTool';
  tables: Table[];
}

export interface StaffSchedulingToolContent extends ToolMessageContent {
  tool: 'StaffSchedulingTool';
  staff?: StaffMember[];
  shifts?: Shift[];
}

export interface KitchenOperationsToolContent extends ToolMessageContent {
  tool: 'KitchenOperationsTool';
  orders: Order[];
}

export interface InventoryManagementToolContent extends ToolMessageContent {
  tool: 'InventoryManagementTool';
  inventory: InventoryItem[];
}

export interface MenuManagementToolContent extends ToolMessageContent {
  tool: 'MenuManagementTool';
  menuItems: MenuItem[];
}

export interface FinancialAnalyticsToolContent extends ToolMessageContent {
  tool: 'FinancialAnalyticsTool';
  financialData: FinancialData;
}

export interface GuestFeedbackToolContent extends ToolMessageContent {
  tool: 'GuestFeedbackTool';
  feedbackItems: FeedbackItem[];
}

export type ToolContentTypes =
  | ReservationsToolContent
  | TableManagementToolContent
  | StaffSchedulingToolContent
  | KitchenOperationsToolContent
  | InventoryManagementToolContent
  | MenuManagementToolContent
  | FinancialAnalyticsToolContent
  | GuestFeedbackToolContent;
