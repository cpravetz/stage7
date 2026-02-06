export interface JobPosting {
  id: string;
  title: string;
  department: string;
  status: 'Open' | 'Closed' | 'On Hold';
  applicants: number;
  hired: number;
}

export interface Candidate {
  id: string;
  name: string;
  email: string;
  stage: 'Applied' | 'Interviewing' | 'Offer Extended' | 'Hired' | 'Rejected';
  score: number; // e.g., Resume score, interview score
}
