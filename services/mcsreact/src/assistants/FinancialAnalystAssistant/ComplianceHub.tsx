import React from 'react';
import { Box, Typography, Paper, List, ListItem, ListItemText, ListItemIcon, Alert, AlertTitle, Chip } from '@mui/material/index.js';
import {CheckCircle as CheckCircleIcon} from '@mui/icons-material';
import {Warning as WarningIcon} from '@mui/icons-material';
import {Error as ErrorIcon} from '@mui/icons-material';

interface ComplianceItem {
  id: string;
  rule: string;
  status: 'Compliant' | 'Warning' | 'Non-Compliant';
  lastChecked: string;
}

const mockComplianceChecks: ComplianceItem[] = [
  { id: 'c1', rule: 'AML Regulations (Anti-Money Laundering)', status: 'Compliant', lastChecked: '2026-02-28' },
  { id: 'c2', rule: 'GDPR Data Privacy Standards', status: 'Warning', lastChecked: '2026-02-20' },
  { id: 'c3', rule: 'SEC Reporting Requirements', status: 'Non-Compliant', lastChecked: '2026-03-05' },
];

const ComplianceHub = () => {
  const getStatusColor = (status: ComplianceItem['status']) => {
    switch (status) {
      case 'Compliant': return 'success';
      case 'Warning': return 'warning';
      case 'Non-Compliant': return 'error';
      default: return 'default';
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Compliance Hub
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Regulatory Compliance Status
        </Typography>
        <List>
          {mockComplianceChecks.map((item) => (
            <ListItem key={item.id} divider>
              <ListItemIcon>
                {item.status === 'Compliant' && <CheckCircleIcon color="success" />}
                {item.status === 'Warning' && <WarningIcon color="warning" />}
                {item.status === 'Non-Compliant' && <ErrorIcon color="error" />}
              </ListItemIcon>
              <ListItemText
                primary={item.rule}
                secondary={`Last Checked: ${item.lastChecked}`}
              />
              <Chip label={item.status} color={getStatusColor(item.status)} />
            </ListItem>
          ))}
        </List>

        <Typography variant="h6" gutterBottom sx={{ mt: 4 }}>
          Regulatory Alerts
        </Typography>
        <Alert severity="warning" sx={{ mb: 2 }}>
          <AlertTitle>New Data Privacy Legislation Proposed</AlertTitle>
          New regulations are being discussed that may impact our data handling processes. Review required.
        </Alert>
        <Alert severity="error">
          <AlertTitle>SEC Filing Deadline Missed</AlertTitle>
          Quarterly report for Company X was due yesterday. Immediate action required.
        </Alert>
      </Paper>
    </Box>
  );
};

export default ComplianceHub;


