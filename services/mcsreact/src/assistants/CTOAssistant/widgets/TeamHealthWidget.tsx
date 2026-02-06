import React from 'react';
import { Paper, Typography, Box, LinearProgress, Chip } from '@mui/material';
import { CheckCircle, Warning, Error } from '@mui/icons-material';

interface TeamHealthWidgetProps {
  data: {
    health_score: number;
    status: string;
    at_risk_members: number;
  };
}

export const TeamHealthWidget: React.FC<TeamHealthWidgetProps> = ({ data }) => {
  const statusIcons: { [key: string]: React.ReactNode } = {
    healthy: <CheckCircle color="success" />,
    warning: <Warning color="warning" />,
    critical: <Error color="error" />,
  };

  const statusColors: { [key: string]: 'success' | 'warning' | 'error' } = {
    healthy: 'success',
    warning: 'warning',
    critical: 'error',
  };

  const statusColor = statusColors[data.status] || 'default';

  return (
    <Paper elevation={3} sx={{ p: 2, height: '100%' }}>
      <Typography variant="h6" gutterBottom>Team Health</Typography>
      
      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
        {statusIcons[data.status]}
        <Box sx={{ ml: 1 }}>
          <Typography variant="body2" color="textSecondary">
            Overall Status
          </Typography>
          <Chip 
            label={data.status.charAt(0).toUpperCase() + data.status.slice(1)} 
            color={statusColor}
            size="small"
          />
        </Box>
      </Box>

      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="textSecondary">Health Score</Typography>
        <LinearProgress 
          variant="determinate" 
          value={Math.min(data.health_score, 100)} 
          sx={{ mb: 0.5 }}
        />
        <Typography variant="caption">{data.health_score.toFixed(0)}/100</Typography>
      </Box>

      {data.at_risk_members > 0 && (
        <Box>
          <Typography variant="body2" color="textSecondary">
            At-Risk Team Members
          </Typography>
          <Typography variant="h6" color="error">
            {data.at_risk_members}
          </Typography>
        </Box>
      )}
    </Paper>
  );
};


