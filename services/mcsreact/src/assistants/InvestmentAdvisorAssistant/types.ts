export interface InvestmentStrategy {
  id: string;
  name: string;
  description: string;
  riskProfile: 'Conservative' | 'Moderate' | 'Aggressive';
  expectedReturn: string;
}

export interface Portfolio {
  id: string;
  name: string;
  holdings: { symbol: string; percentage: number }[];
  currentValue: number;
}

export interface MarketAlert {
  id: string;
  type: 'Market Down' | 'Stock Volatility' | 'Economic News';
  message: string;
  timestamp: string;
}
