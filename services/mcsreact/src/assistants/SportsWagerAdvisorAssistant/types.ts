export interface Strategy {
  id: string;
  name: string;
  description: string;
  riskLevel: 'Low' | 'Medium' | 'High';
  expectedROI: string;
}

export interface Game {
  id: string;
  sport: string;
  teams: string[];
  date: string;
  odds: Record<string, number>; // Team name to odd value
}

export interface Wager {
  id: string;
  gameId: string;
  selection: string; // Which team/outcome
  amount: number;
  potentialPayout: number;
  status: 'pending' | 'won' | 'lost';
}
