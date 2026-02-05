import React from 'react';
import { Paper, Typography, List, ListItem, ListItemText, Chip } from '@mui/material';

interface Alert {
  cve: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  title: string;
  project: string;
}

interface SecurityAlertsWidgetProps {
  alerts: Alert[];
}

const severityColors = {
  Critical: 'error',
  High: 'warning',
  Medium: 'info',
  Low: 'success',
} as const;

export const SecurityAlertsWidget: React.FC<SecurityAlertsWidgetProps> = ({ alerts }) => {
  return (
    <Paper elevation={3} sx={{ p: 2, height: '100%' }}>
      <Typography variant="h6" gutterBottom>Critical & High Security Alerts</Typography>
      <List dense>
        {alerts.map((alert) => (
          <ListItem key={alert.cve} divider>
            <ListItemText
              primary={alert.title}
              secondary={`Project: ${alert.project} | ${alert.cve}`}
            />
            <Chip label={alert.severity} color={severityColors[alert.severity]} size="small" />
          </ListItem>
        ))}
      </List>
    </Paper>
  );
};


