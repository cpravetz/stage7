import React from 'react';
import { Box, Typography, Paper, Grid, List, ListItem, ListItemText } from '@mui/material/index.js';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface MarketResearchDashboardProps {
  onAnalyzeMarket?: (analysis: string) => void;
  onTrackAlert?: (alert: MarketNews) => void;
}

const marketTrendData = [
  { month: 'Jan', S_P500: 4500, NASDAQ: 14000 },
  { month: 'Feb', S_P500: 4550, NASDAQ: 14200 },
  { month: 'Mar', S_P500: 4600, NASDAQ: 14500 },
  { month: 'Apr', S_P500: 4580, NASDAQ: 14300 },
  { month: 'May', S_P500: 4650, NASDAQ: 14600 },
];

interface MarketNews {
  id: string;
  headline: string;
  source: string;
  date: string;
}

const mockMarketNews: MarketNews[] = [
  { id: 'n1', headline: 'Inflation Concerns Drive Market Volatility', source: 'Financial Times', date: '2026-03-01' },
  { id: 'n2', headline: 'Tech Giants Announce Strong Quarterly Earnings', source: 'Wall Street Journal', date: '2026-03-05' },
  { id: 'n3', headline: 'Fed Signals Potential Interest Rate Hike', source: 'Reuters', date: '2026-03-08' },
];

const MarketResearchDashboard: React.FC<MarketResearchDashboardProps> = ({ onAnalyzeMarket, onTrackAlert }) => {
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Market Research Dashboard
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Market Index Trends
            </Typography>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={marketTrendData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="S_P500" stroke="#8884d8" name="S&P 500" />
                <Line type="monotone" dataKey="NASDAQ" stroke="#82ca9d" name="NASDAQ" />
              </LineChart>
            </ResponsiveContainer>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Latest Market News
            </Typography>
            <List>
              {mockMarketNews.map((news) => (
                <ListItem key={news.id} divider>
                  <ListItemText primary={news.headline} secondary={`${news.source} - ${news.date}`} />
                </ListItem>
              ))}
            </List>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default MarketResearchDashboard;


