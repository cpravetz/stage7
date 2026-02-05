export interface StockData {
  symbol: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CompanyFinancials {
  symbol: string;
  year: number;
  revenue: number;
  netIncome: number;
  eps: number; // Earnings Per Share
}

export interface PortfolioHolding {
  symbol: string;
  shares: number;
  averageCost: number;
  currentPrice: number;
}
