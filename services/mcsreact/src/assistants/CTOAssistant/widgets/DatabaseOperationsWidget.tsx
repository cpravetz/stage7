import React from 'react';
import { Paper, Typography, Box, LinearProgress, Chip, Table, TableBody, TableCell, TableRow } from '@mui/material';
import { Storage, Warning, CheckCircle } from '@mui/icons-material';

interface DatabaseInstance {
  name: string;
  type: string;
  status: 'healthy' | 'warning' | 'critical';
  cpu_usage_percent: number;
  memory_usage_percent: number;
  storage_used_percent: number;
  last_backup_hours_ago: number;
  connections_active: number;
  query_latency_ms: number;
}

interface DatabaseOperationsData {
  total_instances: number;
  healthy_instances: number;
  instances: DatabaseInstance[];
  backup_compliance_percent: number;
  performance_score: number;
}

interface DatabaseOperationsWidgetProps {
  data: DatabaseOperationsData;
}

export const DatabaseOperationsWidget: React.FC<DatabaseOperationsWidgetProps> = ({ data }) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle color="success" sx={{ fontSize: 18 }} />;
      case 'warning':
        return <Warning color="warning" sx={{ fontSize: 18 }} />;
      case 'critical':
        return <Warning color="error" sx={{ fontSize: 18 }} />;
      default:
        return null;
    }
  };

  const healthyPercent = data.total_instances > 0 
    ? (data.healthy_instances / data.total_instances) * 100 
    : 0;

  return (
    <Paper elevation={3} sx={{ p: 2, height: '100%' }}>
      <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Storage fontSize="small" />
        Database Operations
      </Typography>

      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="body2" color="textSecondary">
            Database Health
          </Typography>
          <Typography variant="body2" fontWeight="bold">
            {Math.round(healthyPercent)}%
          </Typography>
        </Box>
        <LinearProgress 
          variant="determinate" 
          value={healthyPercent}
          sx={{ height: 6, borderRadius: 1 }}
        />
      </Box>

      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="body2" color="textSecondary">
            Backup Compliance
          </Typography>
          <Typography variant="body2" fontWeight="bold">
            {Math.round(data.backup_compliance_percent)}%
          </Typography>
        </Box>
        <LinearProgress 
          variant="determinate" 
          value={data.backup_compliance_percent}
          sx={{ height: 6, borderRadius: 1 }}
        />
      </Box>

      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="body2" color="textSecondary">
            Performance Score
          </Typography>
          <Typography variant="body2" fontWeight="bold">
            {Math.round(data.performance_score)}/100
          </Typography>
        </Box>
        <LinearProgress 
          variant="determinate" 
          value={Math.min(data.performance_score, 100)}
          sx={{ height: 6, borderRadius: 1 }}
        />
      </Box>

      <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
        Instance Status
      </Typography>
      <Box sx={{ maxHeight: 150, overflowY: 'auto' }}>
        <Table size="small">
          <TableBody>
            {data.instances.slice(0, 5).map((instance, idx) => (
              <TableRow key={idx} sx={{ '&:last-child td': { border: 0 } }}>
                <TableCell sx={{ p: 1, pl: 0, width: 24 }}>
                  {getStatusIcon(instance.status)}
                </TableCell>
                <TableCell sx={{ p: 1 }}>
                  <Typography variant="caption" fontWeight="bold">
                    {instance.name}
                  </Typography>
                </TableCell>
                <TableCell align="right" sx={{ p: 1 }}>
                  <Chip 
                    label={`${Math.round(instance.storage_used_percent)}% storage`}
                    size="small" 
                    variant="outlined"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Paper>
  );
};


