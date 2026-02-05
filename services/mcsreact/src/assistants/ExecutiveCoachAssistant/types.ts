export interface AssessmentResult {
  id: string;
  name: string;
  score: number;
  maxScore: number;
  category: string; // e.g., Communication, Strategic Thinking, Emotional Intelligence
  feedback: string;
}

export interface DevelopmentPlan {
  id: string;
  goal: string;
  status: 'Not Started' | 'In Progress' | 'Completed';
  dueDate: string;
  actionItems: string[];
}

export interface Executive {
  id: string;
  name: string;
  role: string;
  assessments: AssessmentResult[];
  developmentPlans: DevelopmentPlan[];
}
