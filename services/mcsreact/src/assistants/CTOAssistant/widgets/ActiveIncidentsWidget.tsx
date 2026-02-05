import React from 'react';
import { Paper, Typography, List, ListItem, ListItemText, Chip, Box } from '@mui/material';

interface Incident {
  id: string;
  severity: 'High' | 'Medium' | 'Low';
  title: string;
  assignee: string;
}

interface ActiveIncidentsWidgetProps {
  incidents: Incident[];
}

const severityColors = {
  High: 'error',
  Medium: 'warning',
  Low: 'info',
} as const;

export const ActiveIncidentsWidget: React.FC<ActiveIncidentsWidgetProps> = ({ incidents }) => {
  return (
    <Paper elevation={3} sx={{ p: 2, height: '100%' }}>
      <Typography variant="h6" gutterBottom>Active Incidents</Typography>
      <List dense>
        {incidents.map((incident) => (
          <ListItem key={incident.id} divider>
            <ListItemText
              primary={incident.title}
              secondary={`Assignee: ${incident.assignee}`}
            />
            <Chip label={incident.severity} color={severityColors[incident.severity]} size="small" />
          </ListItem>
        ))}
        {incidents.length === 0 && (
          <Box sx={{textAlign: 'center', p: 2}}>
            <Typography color="text.secondary">No active incidents.</Typography>
          </Box>
        )}
      </List>
    </Paper>
  );
};


