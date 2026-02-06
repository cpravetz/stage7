export interface SupportTicket {
  id: string;
  subject: string;
  status: 'Open' | 'Pending' | 'Closed';
  priority: 'Low' | 'Medium' | 'High';
  customerName: string;
  assignedAgent: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  history: string[]; // Recent interactions
}

export interface ImprovementItem {
  id: string;
  suggestion: string;
  action: string;
  completed: boolean;
}

export interface Article {
  id: string;
  title: string;
  content: string;
  tags: string[];
}

export interface Message {
  id: string;
  sender: string;
  subject: string;
  preview: string;
  timestamp: string;
  read: boolean;
  channel: 'email' | 'chat' | 'social';
}

export interface AgentPerformance {
  name: string;
  ticketsResolved: number;
  avgResolutionTime: number; // in hours
  csatScore: number; // Customer Satisfaction Score (0-100)
}

export interface ResponseTemplate {
  id: string;
  name: string;
  category: string;
  content: string;
}
