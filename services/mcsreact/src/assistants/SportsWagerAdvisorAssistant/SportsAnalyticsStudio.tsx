import React from 'react';
import { Box, Typography, Paper, Grid, Button, List, ListItem, ListItemText } from '@mui/material/index.js';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface AnalyticsInsight {
  id: string;
  sport: string;
  insight: string;
  confidence: number;
}

interface SportsAnalyticsStudioProps {
  insights: AnalyticsInsight[];
  onGenerateInsights: (sport: string) => void;
}

const SportsAnalyticsStudio: React.FC<SportsAnalyticsStudioProps> = ({
  insights = [],
  onGenerateInsights
}) => {
  // Mock performance data for visualization
  const mockTeamPerformance = [
    { name: 'Real Madrid', wins: 8, losses: 2, draws: 0 },
    { name: 'Barcelona', wins: 7, losses: 2, draws: 1 },
    { name: 'LA Lakers', wins: 10, losses: 3, draws: 0 },
    { name: 'Boston Celtics', wins: 9, losses: 4, draws: 0 },
  ];

  const sports = ['Football', 'Basketball', 'Tennis', 'Baseball'];

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Sports Analytics Studio
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Team Performance Overview
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={mockTeamPerformance}
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
                <Tooltip />
                <Legend />
                <Bar dataKey="wins" fill="#8884d8" name="Wins" />
                <Bar dataKey="losses" fill="#ffc658" name="Losses" />
                <Bar dataKey="draws" fill="#82ca9d" name="Draws" />
              </BarChart>
            </ResponsiveContainer>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Generate Insights
            </Typography>
            <Grid container spacing={1}>
              {sports.map((sport) => (
                <Grid xs={6} item key={sport}>
                  <Button
                    variant="outlined"
                    fullWidth
                    onClick={() => onGenerateInsights(sport)}
                  >
                    {sport}
                  </Button>
                </Grid>
              ))}
            </Grid>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              AI Insights ({insights.length})
            </Typography>
            <List sx={{ maxHeight: 300, overflowY: 'auto' }}>
              {insights.map((insight) => (
                <ListItem key={insight.id} divider>
                  <ListItemText
                    primary={`${insight.sport} - Confidence: ${(insight.confidence * 100).toFixed(0)}%`}
                    secondary={insight.insight}
                  />
                </ListItem>
              ))}
              {insights.length === 0 && (
                <ListItem>
                  <ListItemText primary="No insights generated yet. Click a sport to analyze." />
                </ListItem>
              )}
            </List>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default SportsAnalyticsStudio;


