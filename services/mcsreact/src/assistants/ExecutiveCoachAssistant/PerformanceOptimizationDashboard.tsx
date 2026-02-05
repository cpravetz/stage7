import React from 'react';
import { Box, Typography, Paper, Grid } from '@mui/material/index.js';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';

const kpiData = [
  { month: 'Jan', revenueGrowth: 10, employeeRetention: 85, projectCompletion: 90 },
  { month: 'Feb', revenueGrowth: 12, employeeRetention: 86, projectCompletion: 92 },
  { month: 'Mar', revenueGrowth: 9, employeeRetention: 84, projectCompletion: 88 },
  { month: 'Apr', revenueGrowth: 15, employeeRetention: 88, projectCompletion: 95 },
  { month: 'May', revenueGrowth: 13, employeeRetention: 87, projectCompletion: 91 },
];

const PerformanceOptimizationDashboard = () => {
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Performance Optimization Dashboard
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Revenue Growth (%)
            </Typography>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={kpiData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value: number) => `${value}%`} />
                <Legend />
                <Line type="monotone" dataKey="revenueGrowth" stroke="#8884d8" name="Revenue Growth" />
              </LineChart>
            </ResponsiveContainer>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Employee Retention (%)
            </Typography>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={kpiData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value: number) => `${value}%`} />
                <Legend />
                <Bar dataKey="employeeRetention" fill="#82ca9d" name="Employee Retention" />
              </BarChart>
            </ResponsiveContainer>
          </Grid>
          <Grid {...({ xs: 12, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Project Completion Rate (%)
            </Typography>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={kpiData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value: number) => `${value}%`} />
                <Legend />
                <Line type="monotone" dataKey="projectCompletion" stroke="#ffc658" name="Project Completion" />
              </LineChart>
            </ResponsiveContainer>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default PerformanceOptimizationDashboard;


