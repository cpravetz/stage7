import React from 'react';
import { Box, Typography, Paper, Grid } from '@mui/material/index.js';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';

const engagementData = [
  { month: 'Jan', activeStudents: 50, avgSessionTime: 30 },
  { month: 'Feb', activeStudents: 55, avgSessionTime: 35 },
  { month: 'Mar', activeStudents: 60, avgSessionTime: 40 },
  { month: 'Apr', activeStudents: 58, avgSessionTime: 38 },
  { month: 'May', activeStudents: 65, avgSessionTime: 45 },
];

const StudentEngagementCenter = () => {
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Student Engagement Center
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Active Students Over Time
            </Typography>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={engagementData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="activeStudents" stroke="#8884d8" name="Active Students" />
              </LineChart>
            </ResponsiveContainer>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Average Session Time (Minutes)
            </Typography>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={engagementData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="avgSessionTime" fill="#82ca9d" name="Avg. Session Time" />
              </BarChart>
            </ResponsiveContainer>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default StudentEngagementCenter;


