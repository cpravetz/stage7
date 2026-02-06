import React from 'react';
import { List, ListItem, ListItemText, Box, Typography, Paper, Grid, Button } from '@mui/material/index.js';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Wager } from './types';

interface PerformanceTrackingDashboardProps {
  wagers: Wager[];
  onAnalyzePerformance: () => void;
}

const PerformanceTrackingDashboard: React.FC<PerformanceTrackingDashboardProps> = ({
  wagers = [],
  onAnalyzePerformance
}) => {
  // Calculate profit/loss over time
  const performanceData = wagers.reduce((acc, wager, idx) => {
    const lastBalance = acc.length > 0 ? acc[acc.length - 1].balance : 0;
    let profitLoss = 0;
    if (wager.status === 'won') {
      profitLoss = wager.potentialPayout - wager.amount;
    } else if (wager.status === 'lost') {
      profitLoss = -wager.amount;
    }
    acc.push({
      id: wager.id,
      balance: lastBalance + profitLoss,
      date: `Wager ${idx + 1}`,
    });
    return acc;
  }, [] as { id: string, balance: number, date: string }[]);

  const totalWagered = wagers.reduce((sum, w) => sum + w.amount, 0);
  const totalWon = wagers.filter(w => w.status === 'won').reduce((sum, w) => sum + (w.potentialPayout - w.amount), 0);
  const totalLost = wagers.filter(w => w.status === 'lost').reduce((sum, w) => sum + w.amount, 0);
  const winRate = wagers.length > 0 ? ((wagers.filter(w => w.status === 'won').length / wagers.length) * 100).toFixed(1) : 0;

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Performance Tracking Dashboard
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid xs={12} item>
            <Grid container spacing={2}>
              <Grid xs={6} md={3} item>
                <Paper sx={{ p: 2 }}>
                  <Typography variant="body2" color="textSecondary">Total Wagered</Typography>
                  <Typography variant="h6" color="primary">${totalWagered.toFixed(2)}</Typography>
                </Paper>
              </Grid>
              <Grid xs={6} md={3} item>
                <Paper sx={{ p: 2 }}>
                  <Typography variant="body2" color="textSecondary">Total Won</Typography>
                  <Typography variant="h6" color="success.main">${totalWon.toFixed(2)}</Typography>
                </Paper>
              </Grid>
              <Grid xs={6} md={3} item>
                <Paper sx={{ p: 2 }}>
                  <Typography variant="body2" color="textSecondary">Total Lost</Typography>
                  <Typography variant="h6" color="error.main">${totalLost.toFixed(2)}</Typography>
                </Paper>
              </Grid>
              <Grid xs={6} md={3} item>
                <Paper sx={{ p: 2 }}>
                  <Typography variant="body2" color="textSecondary">Win Rate</Typography>
                  <Typography variant="h6" color="primary">{winRate}%</Typography>
                </Paper>
              </Grid>
            </Grid>
          </Grid>
          <Grid {...({ xs: 12, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Profit/Loss Over Time
            </Typography>
            {performanceData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={performanceData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                  <Legend />
                  <Line type="monotone" dataKey="balance" stroke="#8884d8" name="Account Balance" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <Typography>No wagers recorded yet.</Typography>
            )}
          </Grid>
          <Grid {...({ xs: 12, item: true } as any)}>
            <Button
              variant="contained"
              onClick={onAnalyzePerformance}
              fullWidth
            >
              Generate Detailed Analysis
            </Button>
          </Grid>
          <Grid {...({ xs: 12, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Wager History ({wagers.length})
            </Typography>
            <List sx={{ maxHeight: 300, overflowY: 'auto' }}>
              {wagers.map((wager) => (
                <ListItem key={wager.id} divider>
                  <ListItemText
                    primary={`Wager on ${wager.selection} - $${wager.amount}`}
                    secondary={`Potential Payout: $${wager.potentialPayout.toFixed(2)} | Status: ${wager.status.toUpperCase()}`}
                  />
                </ListItem>
              ))}
              {wagers.length === 0 && (
                <ListItem>
                  <ListItemText primary="No wagers recorded yet." />
                </ListItem>
              )}
            </List>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default PerformanceTrackingDashboard;


