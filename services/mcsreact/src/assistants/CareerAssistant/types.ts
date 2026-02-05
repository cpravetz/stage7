// services/mcsreact/src/assistants/career-assistant-api/types.ts

// Placeholder for types specific to Career Assistant components
// Will be populated as components are created
export interface CareerProfile {
  id: string;
  name: string;
  skills: string[];
  experience: string;
  goals: string;
}

export interface JobListing {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  matchScore: number;
}

export interface Application {
  id: string;
  jobId: string;
  status: 'Applied' | 'Interviewing' | 'Offer' | 'Rejected';
  dateApplied: string;
}

export interface InterviewSession {
  id: string;
  jobId: string;
  date: string;
  interviewer: string;
  feedback: string;
}

export interface CareerDevelopmentPlan {
  id: string;
  goal: string;
  status: 'Not Started' | 'In Progress' | 'Completed';
  dueDate: string;
  actionItems: string[];
}

export interface JobOfferDetails {
  company: string;
  position: string;
  salary: number;
  benefits: string;
  status: 'Received' | 'Negotiating' | 'Accepted' | 'Rejected';
}

export interface MarketAnalysis {
  averageSalary: number;
  salaryRange: string;
}

export interface NegotiationStrategy {
  talkingPoints: string[];
}

export interface ResumeOptimizationData {
  currentResume: string;
  targetJobDescription: string;
  optimizedResumeContent: string;
  optimizationSuggestions: string[];
}

// Generic interface for tool outputs
export interface ToolOutput {
  tool: string;
  [key: string]: any;
}

