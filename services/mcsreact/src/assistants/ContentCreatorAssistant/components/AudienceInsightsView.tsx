import React, { useMemo } from 'react';
import { Box, Typography, Paper, Grid } from '@mui/material/index.js';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { AudienceDemographics, AudienceInterests } from '@cktmcs/sdk';

interface AudienceInsightsViewProps {
  audienceDemographics: AudienceDemographics[];
  audienceInterests: AudienceInterests[];
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF00FF', '#00FFFF', '#800080'];

const AudienceInsightsView: React.FC<AudienceInsightsViewProps> = ({ audienceDemographics, audienceInterests }) => {
  const pieChartData = useMemo(() => {
    // Transform audienceDemographics for PieChart
    return audienceDemographics.map(demographic => ({
      name: demographic.ageRange, // Use ageRange as name for label/tooltip
      value: demographic.percentage, // Use percentage as value for pie slice size
    }));
  }, [audienceDemographics]);

  const barChartData = useMemo(() => {
    // Transform audienceInterests for BarChart
    return audienceInterests.map(interest => ({
      name: interest.interest, // Use interest as name for YAxis
      users: interest.popularity, // Use popularity as value for bar length
    }));
  }, [audienceInterests]);

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Audience Insights View
      </Typography>
      <Grid container spacing={3}>
        <Grid {...({ xs: 12, md: 6, item: true } as any)}>
          <Paper elevation={2} sx={{ p: 2, height: 350 }}>
            <Typography variant="h6" gutterBottom>
              Audience Demographics (Age)
            </Typography>
            <ResponsiveContainer width="100%" height="80%">
              <PieChart>
                <Pie
                  data={pieChartData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  label
                >
                  {pieChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
        <Grid {...({ xs: 12, md: 6, item: true } as any)}>
          <Paper elevation={2} sx={{ p: 2, height: 350 }}>
            <Typography variant="h6" gutterBottom>
              Audience Interests
            </Typography>
            <ResponsiveContainer width="100%" height="80%">
              <BarChart data={barChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" />
                <Tooltip />
                <Legend />
                <Bar dataKey="users" fill="#82ca9d" name="Number of Users" />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default AudienceInsightsView;


