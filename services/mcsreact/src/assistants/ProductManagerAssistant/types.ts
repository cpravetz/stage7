// services/mcsreact/src/pm-assistant/types.ts

export interface JiraTicketCardProps {
  ticketKey: string;
  title: string;
  status: 'To Do' | 'In Progress' | 'Done' | string;
  type: 'Story' | 'Bug' | 'Epic' | 'Task' | string;
  assignee: {
    name: string;
    avatarUrl?: string;
  };
  summary: string;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  dueDate?: Date | string;
  createdDate: Date | string;
  link: string;
  onView?: () => void;
  onComment?: () => void;
}

export interface DataAnalysisChartProps {
  title: string;
  data: Array<{
    label: string;
    value: number;
    [key: string]: any;
  }>;
  chartType?: 'bar' | 'line' | 'pie' | 'scatter';
  xAxisLabel?: string;
  yAxisLabel?: string;
  insights?: string[];
  onExport?: (format: 'png' | 'csv' | 'json') => void;
}

export interface ConfluencePreviewProps {
  title: string;
  space: string;
  author: string;
  lastUpdated: Date | string;
  content: string; // Markdown content
  link: string;
  onView?: () => void;
  onEdit?: () => void;
  onShare?: () => void;
}

export interface SuggestedAction {
  id: string;
  title: string;
  description: string;
  icon?: React.ReactNode;
  onClick: () => void;
}

export interface SuggestedActionsPanelProps {
  actions: SuggestedAction[];
  title?: string;
}

export interface ContextItem {
  id: string;
  type: 'file' | 'ticket' | 'document' | 'meeting';
  title: string;
  preview: string;
  link: string;
  timestamp: Date | string;
}

export interface CurrentContextPanelProps {
  contextItems: ContextItem[];
  missionName?: string;
  missionStatus?: string;
}