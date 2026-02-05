export interface LearningPlan {
  id: string;
  topic: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  status: 'Not Started' | 'In Progress' | 'Completed';
  dueDate: string;
  resources: string[];
}

export interface Assessment {
  id: string;
  topic: string;
  score: number;
  maxScore: number;
  date: string;
}

export interface Student {
  id: string;
  name: string;
  learningStyle: string; // e.g., Visual, Auditory, Kinesthetic
  currentPlans: LearningPlan[];
  pastAssessments: Assessment[];
}
