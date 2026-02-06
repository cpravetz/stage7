export interface Campaign {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'completed' | 'draft' | 'scheduled';
  performance: number;
  startDate: string;
  endDate: string;
  budget: number;
  targetAudience: string;
  channels: string[];
  objectives: string[];
}

export interface ContentItem {
  id: string;
  title: string;
  type: 'blog' | 'social' | 'email' | 'video' | 'ad';
  status: 'draft' | 'review' | 'published' | 'scheduled';
  campaignId: string;
  publishDate: string;
  content: string;
  author: string;
  performanceMetrics?: {
    views: number;
    engagement: number;
    conversions: number;
  };
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  type: 'campaign' | 'content' | 'meeting' | 'deadline';
  description: string;
  campaignId?: string;
  contentId?: string;
}

export interface PerformanceMetric {
  id: string;
  campaignId: string;
  date: string;
  impressions: number;
  clicks: number;
  conversions: number;
  engagementRate: number;
  roi: number;
  costPerConversion: number;
}

export interface ROIAnalysis {
  id: string;
  campaignId: string;
  period: string;
  totalSpend: number;
  totalRevenue: number;
  roi: number;
  customerAcquisitionCost: number;
  lifetimeValue: number;
  breakEvenAnalysis: string;
}

export interface StakeholderReport {
  id: string;
  title: string;
  campaignId: string;
  generatedDate: string;
  reportType: 'executive' | 'detailed' | 'performance';
  content: string;
  metricsSummary: {
    totalImpressions: number;
    totalConversions: number;
    totalROI: number;
    status: string;
  };
}

export interface ApprovalRequest {
  id: string;
  itemId: string;
  itemType: 'campaign' | 'content' | 'budget';
  status: 'pending' | 'approved' | 'rejected' | 'changes_requested';
  requestedBy: string;
  requestedDate: string;
  approvedBy?: string;
  approvedDate?: string;
  comments?: string;
}

export interface CampaignPlannerData {
  id: string;
  campaignId: string;
  objectives: string[];
  targetAudience: {
    demographics: string;
    interests: string[];
    size: number;
  };
  budgetAllocation: {
    channel: string;
    amount: number;
    percentage: number;
  }[];
  timeline: {
    phase: string;
    startDate: string;
    endDate: string;
    milestones: string[];
  }[];
}

// Tool Content Interfaces
export interface CampaignOverviewToolContent {
  tool: 'CampaignOverviewTool';
  campaigns: Campaign[];
}

export interface ContentCalendarToolContent {
  tool: 'ContentCalendarTool';
  calendarEvents: CalendarEvent[];
  contentItems: ContentItem[];
}

export interface PerformanceDashboardToolContent {
  tool: 'PerformanceDashboardTool';
  metrics: PerformanceMetric[];
}

export interface ROIAnalysisToolContent {
  tool: 'ROIAnalysisTool';
  analyses: ROIAnalysis[];
}

export interface StakeholderReportingToolContent {
  tool: 'StakeholderReportingTool';
  reports: StakeholderReport[];
}

export interface HumanInTheLoopApprovalsToolContent {
  tool: 'HumanInTheLoopApprovalsTool';
  approvalRequests: ApprovalRequest[];
}

export interface CampaignPlannerToolContent {
  tool: 'CampaignPlannerTool';
  plannerData: CampaignPlannerData[];
}

export interface ContentEditorToolContent {
  tool: 'ContentEditorTool';
  contentItems: ContentItem[];
}

// Type guards for tool message content
export function isToolMessageContent(content: any): content is { tool: string } {
  return typeof content === 'object' && content !== null && 'tool' in content;
}

export function isCampaignOverviewToolContent(content: any): content is CampaignOverviewToolContent {
  return isToolMessageContent(content) && content.tool === 'CampaignOverviewTool' && 'campaigns' in content;
}

export function isContentCalendarToolContent(content: any): content is ContentCalendarToolContent {
  return isToolMessageContent(content) && content.tool === 'ContentCalendarTool' && 'calendarEvents' in content;
}

export function isPerformanceDashboardToolContent(content: any): content is PerformanceDashboardToolContent {
  return isToolMessageContent(content) && content.tool === 'PerformanceDashboardTool' && 'metrics' in content;
}

export function isROIAnalysisToolContent(content: any): content is ROIAnalysisToolContent {
  return isToolMessageContent(content) && content.tool === 'ROIAnalysisTool' && 'analyses' in content;
}

export function isStakeholderReportingToolContent(content: any): content is StakeholderReportingToolContent {
  return isToolMessageContent(content) && content.tool === 'StakeholderReportingTool' && 'reports' in content;
}

export function isHumanInTheLoopApprovalsToolContent(content: any): content is HumanInTheLoopApprovalsToolContent {
  return isToolMessageContent(content) && content.tool === 'HumanInTheLoopApprovalsTool' && 'approvalRequests' in content;
}

export function isCampaignPlannerToolContent(content: any): content is CampaignPlannerToolContent {
  return isToolMessageContent(content) && content.tool === 'CampaignPlannerTool' && 'plannerData' in content;
}

export function isContentEditorToolContent(content: any): content is ContentEditorToolContent {
  return isToolMessageContent(content) && content.tool === 'ContentEditorTool' && 'contentItems' in content;
}
