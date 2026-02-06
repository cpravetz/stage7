import React from 'react';
import { Box, Typography, Paper, Grid } from '@mui/material/index.js';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';

interface HiringMetric {
  month: string;
  applications: number;
  interviews: number;
  offers: number;
  hires: number;
}

const mockHiringMetrics: HiringMetric[] = [
  { month: 'Jan', applications: 200, interviews: 50, offers: 10, hires: 5 },
  { month: 'Feb', applications: 220, interviews: 55, offers: 12, hires: 6 },
  { month: 'Mar', applications: 180, interviews: 45, offers: 8, hires: 4 },
  { month: 'Apr', applications: 250, interviews: 60, offers: 15, hires: 7 },
  { month: 'May', applications: 230, interviews: 58, offers: 11, hires: 5 },
];

const HiringAnalyticsDashboard = () => {
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Hiring Analytics Dashboard
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Application & Interview Trends
            </Typography>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={mockHiringMetrics} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="applications" stroke="#8884d8" name="Applications" />
                <Line type="monotone" dataKey="interviews" stroke="#82ca9d" name="Interviews" />
              </LineChart>
            </ResponsiveContainer>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Offers & Hires
            </Typography>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={mockHiringMetrics} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="offers" fill="#ffc658" name="Offers Extended" />
                <Bar dataKey="hires" fill="#ff7300" name="Hires Made" />
              </BarChart>
            </ResponsiveContainer>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default HiringAnalyticsDashboard;


