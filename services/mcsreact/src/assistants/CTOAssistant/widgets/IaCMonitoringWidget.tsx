import React from 'react';
import { Paper, Typography, Box, LinearProgress, Chip, Alert } from '@mui/material';
import { Warning, CheckCircle, Error } from '@mui/icons-material';

interface IaCMonitoringData {
  total_resources: number;
  drift_detected: number;
  compliant_resources: number;
  non_compliant_resources: number;
  last_scan: string;
  tools: {
    terraform: { resources: number; drift: number };
    cloudformation: { resources: number; drift: number };
  };
  highest_risk_drifts: Array<{
    resource_id: string;
    tool: string;
    drift_type: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
  }>;
}

interface IaCMonitoringWidgetProps {
  data: IaCMonitoringData;
}

export const IaCMonitoringWidget: React.FC<IaCMonitoringWidgetProps> = ({ data }) => {
  const compliancePercent = data.total_resources > 0 
    ? (data.compliant_resources / data.total_resources) * 100 
    : 0;

  const driftPercent = data.total_resources > 0 
    ? (data.drift_detected / data.total_resources) * 100 
    : 0;

  const statusIcon = driftPercent > 10 
    ? <Error color="error" /> 
    : driftPercent > 5 
    ? <Warning color="warning" /> 
    : <CheckCircle color="success" />;

  const statusLabel = driftPercent > 10 
    ? 'Critical Drift' 
    : driftPercent > 5 
    ? 'Drift Detected' 
    : 'Compliant';

  return (
    <Paper elevation={3} sx={{ p: 2, height: '100%' }}>
      <Typography variant="h6" gutterBottom>
        Infrastructure as Code
      </Typography>

      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        {statusIcon}
        <Box>
          <Typography variant="body2" color="textSecondary">
            Compliance Status
          </Typography>
          <Chip 
            label={statusLabel} 
            size="small"
            color={driftPercent > 10 ? 'error' : driftPercent > 5 ? 'warning' : 'success'}
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
            {Math.round(compliancePercent)}%
          </Typography>
        </Box>
        <LinearProgress 
          variant="determinate" 
          value={compliancePercent}
          sx={{ height: 6, borderRadius: 1 }}
        />
      </Box>

      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
          Resource Summary
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Chip 
            label={`${data.total_resources} Total`} 
            size="small" 
            variant="outlined"
          />
          <Chip 
            label={`${data.compliant_resources} Compliant`} 
            size="small" 
            color="success" 
            variant="outlined"
          />
          <Chip 
            label={`${data.drift_detected} Drift`} 
            size="small" 
            color="error" 
            variant="outlined"
          />
        </Box>
      </Box>

      {data.highest_risk_drifts.length > 0 && (
        <Box sx={{ mb: 1 }}>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
            Top Risks
          </Typography>
          {data.highest_risk_drifts.slice(0, 2).map((drift, idx) => (
            <Alert key={idx} severity={drift.severity} sx={{ py: 1, mb: 1 }}>
              <Typography variant="body2">
                {drift.resource_id} ({drift.tool})
              </Typography>
            </Alert>
          ))}
        </Box>
      )}

      <Typography variant="caption" color="textSecondary">
        Last scan: {new Date(data.last_scan).toLocaleString()}
      </Typography>
    </Paper>
  );
};


