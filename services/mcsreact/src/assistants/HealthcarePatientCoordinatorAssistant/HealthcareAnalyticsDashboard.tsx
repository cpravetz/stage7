import React from 'react';
import { Box, Typography, Paper, Grid } from '@mui/material/index.js';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';

interface HealthcareAnalyticsDashboardProps {
  onAnalyzeMetrics?: (metricsData: HealthcareMetric[]) => void;
}

interface HealthcareMetric {
  month: string;
  avgWaitTime: number; // in minutes
  readmissionRate: number; // percentage
  bedOccupancy: number; // percentage
}

const mockHealthcareMetrics: HealthcareMetric[] = [
  { month: 'Jan', avgWaitTime: 45, readmissionRate: 12, bedOccupancy: 85 },
  { month: 'Feb', avgWaitTime: 40, readmissionRate: 11, bedOccupancy: 88 },
  { month: 'Mar', avgWaitTime: 50, readmissionRate: 13, bedOccupancy: 82 },
  { month: 'Apr', avgWaitTime: 38, readmissionRate: 10, bedOccupancy: 90 },
  { month: 'May', avgWaitTime: 42, readmissionRate: 11.5, bedOccupancy: 87 },
];

const HealthcareAnalyticsDashboard: React.FC<HealthcareAnalyticsDashboardProps> = ({ onAnalyzeMetrics }) => {
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Healthcare Analytics Dashboard
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Average Patient Wait Time (Minutes)
            </Typography>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={mockHealthcareMetrics} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="avgWaitTime" stroke="#8884d8" name="Avg. Wait Time" />
              </LineChart>
            </ResponsiveContainer>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Readmission Rate (%)
            </Typography>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={mockHealthcareMetrics} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value: number) => `${value}%`} />
                <Legend />
                <Bar dataKey="readmissionRate" fill="#82ca9d" name="Readmission Rate" />
              </BarChart>
            </ResponsiveContainer>
          </Grid>
          <Grid {...({ xs: 12, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Bed Occupancy Rate (%)
            </Typography>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={mockHealthcareMetrics} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value: number) => `${value}%`} />
                <Legend />
                <Line type="monotone" dataKey="bedOccupancy" stroke="#ffc658" name="Bed Occupancy" />
              </LineChart>
            </ResponsiveContainer>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default HealthcareAnalyticsDashboard;


