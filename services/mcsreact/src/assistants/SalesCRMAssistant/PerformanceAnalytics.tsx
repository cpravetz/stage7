import React from 'react';
import { Box, Typography, Paper, Grid } from '@mui/material/index.js';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { PerformanceMetric, Salesperson } from './types';

interface PerformanceAnalyticsProps {
  metrics: PerformanceMetric[];
  sendMessage: (message: string) => void;
}

const PerformanceAnalytics: React.FC<PerformanceAnalyticsProps> = ({ 
  metrics, 
  sendMessage 
}) => {
  // Convert metrics to salesperson data for chart
  const salespeopleData = metrics.map(metric => ({
    name: `Salesperson ${metric.salespersonId}`,
    quota: 500000, // Default quota for display
    achieved: metric.revenueGenerated,
    dealsClosed: metric.dealsClosed,
    conversionRate: metric.conversionRate * 100
  }));

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Performance Analytics
      </Typography>
      
      {metrics.length === 0 ? (
        <Typography variant="body1" color="text.secondary">
          No performance data available.
        </Typography>
      ) : (
        <Paper elevation={2} sx={{ p: 2 }}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Salesperson Performance vs. Quota
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={salespeopleData}
                  margin={{
                    top: 5,
                    right: 30,
                    left: 20,
                    bottom: 5,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => typeof value === 'number' ? `$${value}` : value} />
                  <Legend />
                  <Bar dataKey="achieved" fill="#82ca9d" name="Revenue Generated" />
                  <Bar dataKey="dealsClosed" fill="#8884d8" name="Deals Closed" />
                </BarChart>
              </ResponsiveContainer>
            </Grid>
            
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Performance Metrics
              </Typography>
              <Grid container spacing={2}>
                {metrics.map((metric, index) => (
                  <Grid item xs={12} sm={6} md={4} key={index}>
                    <Paper elevation={1} sx={{ p: 2 }}>
                      <Typography variant="subtitle1">Salesperson {metric.salespersonId}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Revenue: ${metric.revenueGenerated.toLocaleString()}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Deals Closed: {metric.dealsClosed}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Conversion Rate: {(metric.conversionRate * 100).toFixed(1)}%
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Avg Deal Size: ${metric.averageDealSize.toLocaleString()}
                      </Typography>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            </Grid>
          </Grid>
        </Paper>
      )}
    </Box>
  );
};

export default PerformanceAnalytics;


