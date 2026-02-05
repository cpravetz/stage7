import React from 'react';
import { Box, Typography, Paper, Grid, Select, MenuItem, FormControl, InputLabel, Button } from '@mui/material/index.js';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { PerformanceMetric } from './types';

interface PerformanceDashboardProps {
  metrics: PerformanceMetric[];
  sendMessage: (message: string) => Promise<any>;
}

const PerformanceDashboard: React.FC<PerformanceDashboardProps> = ({
  metrics,
  sendMessage
}) => {
  const [selectedCampaign, setSelectedCampaign] = React.useState<string>('all');
  const [timeRange, setTimeRange] = React.useState<string>('month');

  const campaignIds = React.useMemo(() => {
    return Array.from(new Set(metrics.map(m => m.campaignId)));
  }, [metrics]);

  const filteredMetrics = React.useMemo(() => {
    if (selectedCampaign === 'all') {
      return metrics;
    }
    return metrics.filter(m => m.campaignId === selectedCampaign);
  }, [metrics, selectedCampaign]);

  const chartData = React.useMemo(() => {
    const groupedByDate = filteredMetrics.reduce((acc, metric) => {
      const date = metric.date.split('T')[0];
      if (!acc[date]) {
        acc[date] = {
          date,
          impressions: 0,
          clicks: 0,
          conversions: 0,
          engagement: 0
        };
      }
      acc[date].impressions += metric.impressions;
      acc[date].clicks += metric.clicks;
      acc[date].conversions += metric.conversions;
      acc[date].engagement += metric.engagementRate;
      return acc;
    }, {} as Record<string, { date: string; impressions: number; clicks: number; conversions: number; engagement: number }>);

    return Object.values(groupedByDate).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [filteredMetrics]);

  const handleGenerateReport = () => {
    sendMessage(`Generate performance report for campaign ${selectedCampaign} over ${timeRange}`);
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" gutterBottom>
          Performance Dashboard
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Campaign</InputLabel>
            <Select
              value={selectedCampaign}
              label="Campaign"
              onChange={(e) => setSelectedCampaign(e.target.value)}
            >
              <MenuItem value="all">All Campaigns</MenuItem>
              {campaignIds.map((id) => (
                <MenuItem key={id} value={id}>Campaign {id}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Time Range</InputLabel>
            <Select
              value={timeRange}
              label="Time Range"
              onChange={(e) => setTimeRange(e.target.value)}
            >
              <MenuItem value="week">Week</MenuItem>
              <MenuItem value="month">Month</MenuItem>
              <MenuItem value="quarter">Quarter</MenuItem>
              <MenuItem value="year">Year</MenuItem>
            </Select>
          </FormControl>
          <Button variant="contained" onClick={handleGenerateReport}>
            Generate Report
          </Button>
        </Box>
      </Box>
      <Grid container spacing={3}>
        <Grid {...({ xs: 12, md: 6, item: true } as any)}>
          <Paper elevation={2} sx={{ p: 2, height: 300 }}>
            <Typography variant="h6" gutterBottom>
              Engagement Metrics
            </Typography>
            <ResponsiveContainer width="100%" height="80%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="impressions" stroke="#8884d8" name="Impressions" />
                <Line type="monotone" dataKey="clicks" stroke="#82ca9d" name="Clicks" />
                <Line type="monotone" dataKey="conversions" stroke="#ffc658" name="Conversions" />
              </LineChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
        <Grid {...({ xs: 12, md: 6, item: true } as any)}>
          <Paper elevation={2} sx={{ p: 2, height: 300 }}>
            <Typography variant="h6" gutterBottom>
              Performance Metrics
            </Typography>
            <ResponsiveContainer width="100%" height="80%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="engagement" fill="#ffc658" name="Engagement Rate" />
                <Bar dataKey="conversions" fill="#82ca9d" name="Conversions" />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default PerformanceDashboard;


