import React from 'react';
import { Paper, Typography, Box, Chip } from '@mui/material';
import { TrendingUp, TrendingDown } from '@mui/icons-material';

interface CostTrendsWidgetProps {
  data: {
    week_over_week_percent_change: number;
    trend_direction: string;
    forecasted_total: number;
  };
}

export const CostTrendsWidget: React.FC<CostTrendsWidgetProps> = ({ data }) => {
  const trendIcon = data.trend_direction === 'increasing' ? (
    <TrendingUp color="error" sx={{ mr: 1 }} />
  ) : (
    <TrendingDown color="success" sx={{ mr: 1 }} />
  );

  const changeColor = data.week_over_week_percent_change > 0 ? 'error' : 'success';

  return (
    <Paper elevation={3} sx={{ p: 2, height: '100%' }}>
      <Typography variant="h6" gutterBottom>Cost Trends</Typography>
      
      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
        {trendIcon}
        <Box>
          <Typography variant="body2" color="textSecondary">
            Week-over-Week Change
          </Typography>
          <Typography variant="h6">
            {data.week_over_week_percent_change > 0 ? '+' : ''}
            {data.week_over_week_percent_change.toFixed(2)}%
          </Typography>
        </Box>
      </Box>

      <Box>
        <Typography variant="body2" color="textSecondary">
          Forecasted Monthly Total
        </Typography>
        <Typography variant="h5">
          ${data.forecasted_total?.toLocaleString('en-US', { maximumFractionDigits: 0 }) || 'N/A'}
        </Typography>
      </Box>

      <Box sx={{ mt: 2 }}>
        <Chip 
          label={data.trend_direction.charAt(0).toUpperCase() + data.trend_direction.slice(1)} 
          color={changeColor}
          size="small"
        />
      </Box>
    </Paper>
  );
};


