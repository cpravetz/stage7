import React from 'react';
import { Box, Typography, Paper, Grid } from '@mui/material/index.js';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

const sentimentData = [
  { name: 'Positive', value: 600 },
  { name: 'Neutral', value: 250 },
  { name: 'Negative', value: 150 },
];

const COLORS = ['#00C49F', '#FFBB28', '#FF0000']; // Green for positive, Yellow for neutral, Red for negative

const SentimentMonitoringDashboard = () => {
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Sentiment Monitoring Dashboard
      </Typography>
      <Paper elevation={2} sx={{ p: 2, height: 350 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Customer Sentiment Distribution
            </Typography>
            <ResponsiveContainer width="100%" height="80%">
              <PieChart>
                <Pie
                  data={sentimentData}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                  label
                >
                  {sentimentData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default SentimentMonitoringDashboard;


