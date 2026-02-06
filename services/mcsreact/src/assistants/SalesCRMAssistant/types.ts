export interface Deal {
  id: string;
  name: string;
  stage: 'Lead' | 'Qualification' | 'Proposal' | 'Negotiation' | 'Closed Won' | 'Closed Lost';
  value: number;
  expectedCloseDate: string;
  contactName?: string;
  company?: string;
}

export interface Salesperson {
  id: string;
  name: string;
  quota: number;
  achieved: number;
  email?: string;
}

export interface Lead {
  id: string;
  name: string;
  company: string;
  status: 'New' | 'Contacted' | 'Qualified' | 'Unqualified';
  email: string;
  phone?: string;
  source?: string;
}

export interface Customer {
  id: string;
  name: string;
  company: string;
  email: string;
  phone?: string;
  lifetimeValue: number;
  lastPurchaseDate?: string;
}

export interface SalesActivity {
  id: string;
  type: 'Call' | 'Email' | 'Meeting' | 'Demo';
  date: string;
  description: string;
  relatedTo: string; // Deal ID, Lead ID, or Customer ID
  outcome?: string;
}

export interface SalesForecast {
  period: string; // e.g., 'Q1 2026', '2026'
  forecastAmount: number;
  pipelineAmount: number;
  confidenceLevel: 'High' | 'Medium' | 'Low';
}

export interface PerformanceMetric {
  salespersonId: string;
  period: string;
  dealsClosed: number;
  revenueGenerated: number;
  conversionRate: number;
  averageDealSize: number;
}

export interface PipelineOverviewToolContent {
  tool: 'PipelineOverviewTool';
  deals: Deal[];
}

export interface LeadManagementToolContent {
  tool: 'LeadManagementTool';
  leads: Lead[];
}

export interface Customer360ToolContent {
  tool: 'Customer360Tool';
  customers: Customer[];
}

export interface ActivityTrackingToolContent {
  tool: 'ActivityTrackingTool';
  activities: SalesActivity[];
}

export interface SalesForecastingToolContent {
  tool: 'SalesForecastingTool';
  forecasts: SalesForecast[];
}

export interface PerformanceAnalyticsToolContent {
  tool: 'PerformanceAnalyticsTool';
  metrics: PerformanceMetric[];
}

export interface ReportingCenterToolContent {
  tool: 'ReportingCenterTool';
  reports: any[]; // Can be more specific based on actual report structure
}

// Type guards for tool message content
export function isToolMessageContent(content: any): content is { tool: string } {
  return typeof content === 'object' && content !== null && 'tool' in content;
}

export function isPipelineOverviewToolContent(content: any): content is PipelineOverviewToolContent {
  return isToolMessageContent(content) && content.tool === 'PipelineOverviewTool' && 'deals' in content;
}

export function isLeadManagementToolContent(content: any): content is LeadManagementToolContent {
  return isToolMessageContent(content) && content.tool === 'LeadManagementTool' && 'leads' in content;
}

export function isCustomer360ToolContent(content: any): content is Customer360ToolContent {
  return isToolMessageContent(content) && content.tool === 'Customer360Tool' && 'customers' in content;
}

export function isActivityTrackingToolContent(content: any): content is ActivityTrackingToolContent {
  return isToolMessageContent(content) && content.tool === 'ActivityTrackingTool' && 'activities' in content;
}

export function isSalesForecastingToolContent(content: any): content is SalesForecastingToolContent {
  return isToolMessageContent(content) && content.tool === 'SalesForecastingTool' && 'forecasts' in content;
}

export function isPerformanceAnalyticsToolContent(content: any): content is PerformanceAnalyticsToolContent {
  return isToolMessageContent(content) && content.tool === 'PerformanceAnalyticsTool' && 'metrics' in content;
}

export function isReportingCenterToolContent(content: any): content is ReportingCenterToolContent {
  return isToolMessageContent(content) && content.tool === 'ReportingCenterTool' && 'reports' in content;
}
