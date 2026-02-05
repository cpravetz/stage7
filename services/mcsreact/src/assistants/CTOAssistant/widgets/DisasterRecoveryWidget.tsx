import React from 'react';
import { Paper, Typography, Box, LinearProgress, Chip, Alert } from '@mui/material';
import { Backup, CheckCircle, Warning, Error } from '@mui/icons-material';

interface RPOMetric {
  backup_type: string;
  last_backup_minutes_ago: number;
  rpo_minutes: number;
  compliant: boolean;
}

interface RTOMetric {
  recovery_target: string;
  estimated_rto_minutes: number;
  tested_rto_minutes: number;
  last_test_days_ago: number;
  status: 'untested' | 'passed' | 'failed';
}

interface DisasterRecoveryData {
  overall_status: 'compliant' | 'at_risk' | 'non_compliant';
  rpo_metrics: RPOMetric[];
  rto_metrics: RTOMetric[];
  backup_storage_gb: number;
  backup_storage_quota_gb: number;
  last_failover_test_days_ago: number;
  compliance_percent: number;
}

interface DisasterRecoveryWidgetProps {
  data: DisasterRecoveryData;
}

export const DisasterRecoveryWidget: React.FC<DisasterRecoveryWidgetProps> = ({ data }) => {
  const storagePercent = (data.backup_storage_gb / data.backup_storage_quota_gb) * 100;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'compliant':
      case 'passed':
        return <CheckCircle color="success" />;
      case 'at_risk':
      case 'untested':
        return <Warning color="warning" />;
      case 'failed':
      case 'non_compliant':
        return <Error color="error" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string): 'success' | 'warning' | 'error' => {
    if (status === 'compliant' || status === 'passed') return 'success';
    if (status === 'at_risk' || status === 'untested') return 'warning';
    return 'error';
  };

  return (
    <Paper elevation={3} sx={{ p: 2, height: '100%' }}>
      <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Backup fontSize="small" />
        Disaster Recovery
      </Typography>

      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        {getStatusIcon(data.overall_status)}
        <Box>
          <Typography variant="body2" color="textSecondary">
            Overall Status
          </Typography>
          <Chip 
            label={data.overall_status.charAt(0).toUpperCase() + data.overall_status.slice(1)}
            color={getStatusColor(data.overall_status)}
            size="small"
            variant="outlined"
          />
        </Box>
      </Box>

      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="body2" color="textSecondary">
            Compliance Rate
          </Typography>
          <Typography variant="body2" fontWeight="bold">
            {Math.round(data.compliance_percent)}%
          </Typography>
        </Box>
        <LinearProgress 
          variant="determinate" 
          value={data.compliance_percent}
          sx={{ height: 6, borderRadius: 1 }}
        />
      </Box>

      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
          RPO Status
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {data.rpo_metrics.map((rpo, idx) => (
            <Box 
              key={idx}
              sx={{ 
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                p: 1,
                backgroundColor: '#f5f5f5',
                borderRadius: 1
              }}
            >
              <Box>
                <Typography variant="caption" fontWeight="bold">
                  {rpo.backup_type}
                </Typography>
                <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
                  {rpo.last_backup_minutes_ago}m ago / RPO: {rpo.rpo_minutes}m
                </Typography>
              </Box>
              <Chip 
                label={rpo.compliant ? 'OK' : 'Late'}
                color={rpo.compliant ? 'success' : 'error'}
                size="small"
                variant="outlined"
              />
            </Box>
          ))}
        </Box>
      </Box>

      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
          RTO Status
        </Typography>
        {data.rto_metrics.slice(0, 2).map((rto, idx) => (
          <Alert 
            key={idx}
            severity={rto.status === 'passed' ? 'success' : rto.status === 'untested' ? 'warning' : 'error'}
            sx={{ py: 1, mb: 1, fontSize: '0.85rem' }}
          >
            <Typography variant="caption" fontWeight="bold" display="block">
              {rto.recovery_target}
            </Typography>
            <Typography variant="caption" display="block">
              Est: {rto.estimated_rto_minutes}m | Tested: {rto.tested_rto_minutes}m | {rto.last_test_days_ago}d ago
            </Typography>
          </Alert>
        ))}
      </Box>

      <Box sx={{ mb: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="body2" color="textSecondary">
            Backup Storage
          </Typography>
          <Typography variant="body2" fontWeight="bold">
            {Math.round(storagePercent)}%
          </Typography>
        </Box>
        <LinearProgress 
          variant="determinate" 
          value={Math.min(storagePercent, 100)}
          color={storagePercent > 90 ? 'warning' : 'success'}
          sx={{ height: 6, borderRadius: 1 }}
        />
        <Typography variant="caption" color="textSecondary">
          {data.backup_storage_gb}GB / {data.backup_storage_quota_gb}GB
        </Typography>
      </Box>
    </Paper>
  );
};


