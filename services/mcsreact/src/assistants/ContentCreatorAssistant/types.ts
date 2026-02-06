export interface ContentIdea {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  status: 'Draft' | 'Approved' | 'Rejected';
}

export interface ContentGoal {
  id: string;
  goal: string;
}

export interface TrendingTopic {
  id: string;
  topic: string;
  popularity: number;
  growth: number;
}

export interface TargetAudience {
  id: string;
  audience: string;
}

export interface ContentPiece {
  id: string;
  title: string;
  platform: 'Social Media' | 'Email' | 'Blog' | 'Video';
  content: string;
  status: 'Draft' | 'Pending Review' | 'Published';
}

export interface ToolOutput {
  tool: string;
  [key: string]: any;
}

export interface PlatformPerformance {
  id: string;
  platform: string;
  engagement: number;
  reach: number;
  growth: number;
}

export interface TopContent {
  id: string;
  title: string;
  platform: string;
  engagement: number;
  views: number;
}

export interface AudienceDemographics {
  id: string;
  ageRange: string;
  gender: string;
  location: string;
  percentage: number;
}

export interface AudienceInterests {
  id: string;
  interest: string;
  popularity: number;
}

export interface EngagementPatterns {
  id: string;
  pattern: string;
  time: string;
  frequency: number;
}

export interface PublishQueueItem {
  id: string;
  contentId: string;
  platform: string;
  scheduledTime: Date;
  status: 'Pending' | 'Published' | 'Failed';
}

export interface PublishingStats {
  id: string;
  totalPublished: number;
  successRate: number;
  averageEngagement: number;
}

export interface SeoMetrics {
  id: string;
  keyword: string;
  ranking: number;
  searchVolume: number;
  difficulty: number;
}

export interface SeoSuggestion {
  id: string;
  suggestion: string;
  impact: 'High' | 'Medium' | 'Low';
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

export interface ScheduledContent {
  date: Date;
  title: string;
  platform: string;
}

export interface ApprovalRequest {
  id: string;
  type: 'Content Draft' | 'SEO Strategy' | 'Publishing Approval';
  description: string;
  status: 'pending' | 'approved' | 'rejected';
}
