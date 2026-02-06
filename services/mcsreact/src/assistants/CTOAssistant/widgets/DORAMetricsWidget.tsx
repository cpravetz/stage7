import React from 'react';
import { Paper, Typography, Grid, Box, Tooltip } from '@mui/material';
import { ArrowUpward, ArrowDownward, TrendingFlat } from '@mui/icons-material';

interface MetricDisplayProps {
  title: string;
  value: string;
  trend: number;
}

const MetricDisplay: React.FC<MetricDisplayProps> = ({ title, value, trend }) => {
  const TrendIcon = trend > 0 ? ArrowUpward : trend < 0 ? ArrowDownward : TrendingFlat;
  const trendColor = trend > 0 ? 'error.main' : trend < 0 ? 'success.main' : 'text.secondary';

  return (
    <Grid item xs={6} sm={3}>
      <Tooltip title={`Trend: ${trend > 0 ? '+' : ''}${trend * 100}%`} arrow>
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary">{title}</Typography>
          <Typography variant="h5">{value}</Typography>
          <TrendIcon sx={{ color: trendColor, verticalAlign: 'middle' }} />
        </Box>
      </Tooltip>
    </Grid>
  );
};

interface DORAMetricsWidgetProps {
  metrics: {
    deploymentFrequency: { value: string; trend: number };
    leadTime: { value: string; trend: number };
    changeFailureRate: { value: string; trend: number };
    timeToRestore: { value: string; trend: number };
  };
}

export const DORAMetricsWidget: React.FC<DORAMetricsWidgetProps> = ({ metrics }) => {
  return (
    <Paper elevation={3} sx={{ p: 2, height: '100%' }}>
      <Typography variant="h6" gutterBottom>DORA Metrics</Typography>
      <Grid container spacing={2}>
        <MetricDisplay title="Deployment Frequency" value={metrics.deploymentFrequency.value} trend={metrics.deploymentFrequency.trend} />
        <MetricDisplay title="Lead Time for Changes" value={metrics.leadTime.value} trend={metrics.leadTime.trend} />
        <MetricDisplay title="Change Failure Rate" value={metrics.changeFailureRate.value} trend={metrics.changeFailureRate.trend} />
        <MetricDisplay title="Time to Restore" value={metrics.timeToRestore.value} trend={metrics.timeToRestore.trend} />
      </Grid>
    </Paper>
  );
};


