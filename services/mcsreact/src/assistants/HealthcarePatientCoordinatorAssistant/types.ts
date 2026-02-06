export interface Patient {
  id: string;
  name: string;
  age: number;
  gender: string;
  reasonForVisit: string;
  status: 'Waiting' | 'In Progress' | 'Completed';
  priority: 'Routine' | 'Urgent' | 'Emergency';
}

export interface CarePlan {
  id: string;
  patientId: string;
  goal: string;
  interventions: string[];
  status: 'Active' | 'Resolved' | 'Discontinued';
}

export interface Appointment {
  id: string;
  patientId: string;
  date: string;
  time: string;
  provider: string;
  type: string;
  status: 'Scheduled' | 'Completed' | 'Cancelled';
}
