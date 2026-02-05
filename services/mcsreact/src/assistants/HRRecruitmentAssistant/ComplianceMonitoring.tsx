import React from 'react';
import { Box, Typography, Paper, List, ListItem, ListItemText, ListItemIcon, Alert, AlertTitle, Chip } from '@mui/material/index.js';
import {CheckCircle as CheckCircleIcon} from '@mui/icons-material';
import {Warning as WarningIcon} from '@mui/icons-material';
import {Error as ErrorIcon} from '@mui/icons-material';

interface ComplianceCheck {
  id: string;
  rule: string;
  status: 'Compliant' | 'Warning' | 'Non-Compliant';
  lastChecked: string;
  details: string;
}

const mockComplianceChecks: ComplianceCheck[] = [
  { id: 'cc1', rule: 'EEO Regulations (Equal Employment Opportunity)', status: 'Compliant', lastChecked: '2026-02-15', details: 'All hiring practices conform to EEO guidelines.' },
  { id: 'cc2', rule: 'Immigration Compliance (Form I-9)', status: 'Warning', lastChecked: '2026-02-28', details: 'Pending verification for 2 new hires.' },
  { id: 'cc3', rule: 'Data Privacy for Candidate Information', status: 'Non-Compliant', lastChecked: '2026-03-01', details: 'Candidate data not fully encrypted in legacy system.' },
];

const ComplianceMonitoring = () => {
  const getStatusColor = (status: ComplianceCheck['status']) => {
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
        Compliance Monitoring
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          HR Compliance Status
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
                secondary={`Last Checked: ${item.lastChecked} | Details: ${item.details}`}
              />
              <Chip label={item.status} color={getStatusColor(item.status)} />
            </ListItem>
          ))}
        </List>

        <Typography variant="h6" gutterBottom sx={{ mt: 4 }}>
          Compliance Alerts
        </Typography>
        <Alert severity="warning" sx={{ mb: 2 }}>
          <AlertTitle>Upcoming Regulation Change</AlertTitle>
          New federal guidelines for remote employee onboarding are expected next quarter. Review and update policies.
        </Alert>
        <Alert severity="error">
          <AlertTitle>Audit Flagged: Unverified I-9 Forms</AlertTitle>
          Two candidate I-9 forms are past due for verification. Immediate action required to avoid penalties.
        </Alert>
      </Paper>
    </Box>
  );
};

export default ComplianceMonitoring;


