import React, { useMemo } from 'react';
import { Box, Typography, Paper, Grid } from '@mui/material/index.js';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { PlatformPerformance } from '@cktmcs/sdk';

interface PerformanceDashboardProps {
  performanceData: PlatformPerformance[];
}

const PerformanceDashboard: React.FC<PerformanceDashboardProps> = ({ performanceData }) => {
  const transformedData = useMemo(() => {
    // Aggregate data by platform and create dummy values for specific chart keys
    const dataMap = new Map<string, any>();

    performanceData.forEach(item => {
      let entry = dataMap.get(item.platform) || { name: item.platform, blogViews: 0, socialEngage: 0, videoPlays: 0 };

      // Simple aggregation, can be refined based on actual data structure from tools
      if (item.platform === 'Blog') {
        entry.blogViews += item.engagement + item.reach;
      } else if (item.platform === 'Social Media') {
        entry.socialEngage += item.engagement;
      } else if (item.platform === 'Video') {
        entry.videoPlays += item.reach; // Assuming reach is a good proxy for video plays
      } else {
        // For other platforms, aggregate into socialEngage
        entry.socialEngage += item.engagement;
      }
      dataMap.set(item.platform, entry);
    });

    return Array.from(dataMap.values());
  }, [performanceData]);

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Performance Dashboard
      </Typography>
      <Grid container spacing={3}>
        <Grid {...({ xs: 12, md: 6, item: true } as any)}>
          <Paper elevation={2} sx={{ p: 2, height: 300 }}>
            <Typography variant="h6" gutterBottom>
              Content Engagement Trends
            </Typography>
            <ResponsiveContainer width="100%" height="80%">
              <LineChart data={transformedData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="blogViews" stroke="#8884d8" name="Blog Views" />
                <Line type="monotone" dataKey="socialEngage" stroke="#82ca9d" name="Social Engagement" />
              </LineChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
        <Grid {...({ xs: 12, md: 6, item: true } as any)}>
          <Paper elevation={2} sx={{ p: 2, height: 300 }}>
            <Typography variant="h6" gutterBottom>
              Video Performance
            </Typography>
            <ResponsiveContainer width="100%" height="80%">
              <BarChart data={transformedData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="videoPlays" fill="#ffc658" name="Video Plays" />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default PerformanceDashboard;


