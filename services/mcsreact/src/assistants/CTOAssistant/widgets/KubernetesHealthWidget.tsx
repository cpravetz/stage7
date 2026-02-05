import React from 'react';
import { Paper, Typography, Box, Chip, LinearProgress } from '@mui/material';
import { CheckCircle, Warning, Error } from '@mui/icons-material';

interface KubernetesHealthWidgetProps {
  data: {
    cluster_status: string;
    healthy_nodes: number;
    total_nodes: number;
    at_risk_pods: number;
  };
}

export const KubernetesHealthWidget: React.FC<KubernetesHealthWidgetProps> = ({ data }) => {
  const nodeHealth = (data.healthy_nodes / data.total_nodes) * 100;
  const statusColor = data.cluster_status === 'Healthy' ? 'success' : 'warning';

  return (
    <Paper elevation={3} sx={{ p: 2, height: '100%' }}>
      <Typography variant="h6" gutterBottom>Kubernetes Cluster Health</Typography>
      
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          {data.cluster_status === 'Healthy' ? (
            <CheckCircle color="success" sx={{ mr: 1 }} />
          ) : (
            <Warning color="warning" sx={{ mr: 1 }} />
          )}
          <Chip label={data.cluster_status} color={statusColor} size="small" />
        </Box>
      </Box>

      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="textSecondary">Node Health</Typography>
        <LinearProgress 
          variant="determinate" 
          value={nodeHealth} 
          sx={{ mb: 0.5 }}
        />
        <Typography variant="caption">
          {data.healthy_nodes}/{data.total_nodes} nodes ready ({nodeHealth.toFixed(0)}%)
        </Typography>
      </Box>

      {data.at_risk_pods > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Error color="warning" sx={{ mr: 1, fontSize: 20 }} />
          <Typography variant="body2">
            {data.at_risk_pods} pod(s) at risk
          </Typography>
        </Box>
      )}
    </Paper>
  );
};


