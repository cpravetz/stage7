import React from 'react';
import { Box, Typography, Paper, Grid } from '@mui/material/index.js';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';

const revenueGrowthData = [
  { quarter: 'Q1', value: 10, forecast: 9 },
  { quarter: 'Q2', value: 12, forecast: 11 },
  { quarter: 'Q3', value: 11, forecast: 10.5 },
  { quarter: 'Q4', value: 14, forecast: 13 },
];

const profitMarginData = [
  { quarter: 'Q1', grossMargin: 40, netMargin: 15 },
  { quarter: 'Q2', grossMargin: 42, netMargin: 17 },
  { quarter: 'Q3', grossMargin: 41, netMargin: 16 },
  { quarter: 'Q4', grossMargin: 43, netMargin: 18 },
];

const FinancialVisualizationSuite = () => {
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Financial Visualization Suite
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Quarterly Revenue Growth (%)
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={revenueGrowthData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="quarter" />
                <YAxis />
                <Tooltip formatter={(value: number) => `${value}%`} />
                <Legend />
                <Line type="monotone" dataKey="value" stroke="#8884d8" name="Actual Growth" />
                <Line type="monotone" dataKey="forecast" stroke="#82ca9d" name="Forecast" />
              </LineChart>
            </ResponsiveContainer>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Profit Margins (%)
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={profitMarginData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="quarter" />
                <YAxis />
                <Tooltip formatter={(value: number) => `${value}%`} />
                <Area type="monotone" dataKey="grossMargin" stackId="1" stroke="#8884d8" fill="#8884d8" name="Gross Margin" />
                <Area type="monotone" dataKey="netMargin" stackId="1" stroke="#82ca9d" fill="#82ca9d" name="Net Margin" />
                <Legend />
              </AreaChart>
            </ResponsiveContainer>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default FinancialVisualizationSuite;


