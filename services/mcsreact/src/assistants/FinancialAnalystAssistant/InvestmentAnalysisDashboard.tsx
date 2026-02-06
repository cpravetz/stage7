import React from 'react';
import { Box, Typography, Paper, Grid } from '@mui/material/index.js';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const investmentData = [
  { month: 'Jan', portfolioValue: 100000, marketIndex: 1000 },
  { month: 'Feb', portfolioValue: 102000, marketIndex: 1010 },
  { month: 'Mar', portfolioValue: 101000, marketIndex: 990 },
  { month: 'Apr', portfolioValue: 105000, marketIndex: 1030 },
  { month: 'May', portfolioValue: 107000, marketIndex: 1050 },
  { month: 'Jun', portfolioValue: 110000, marketIndex: 1070 },
];

const InvestmentAnalysisDashboard = () => {
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Investment Analysis Dashboard
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Portfolio Performance vs. Market Index
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={investmentData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                <Legend />
                <Line type="monotone" dataKey="portfolioValue" stroke="#8884d8" name="Portfolio Value" />
                <Line type="monotone" dataKey="marketIndex" stroke="#82ca9d" name="Market Index" />
              </LineChart>
            </ResponsiveContainer>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default InvestmentAnalysisDashboard;


