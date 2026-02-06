import React from 'react';
import { Box, Typography, Paper, List, ListItem, ListItemText, ListItemIcon } from '@mui/material/index.js';
import {Timeline as TimelineIcon} from '@mui/icons-material';
import {CheckCircle as CheckCircleIcon} from '@mui/icons-material';

interface PresenceMilestone {
  id: string;
  date: string;
  description: string;
  type: 'Training' | 'Feedback' | 'Achievement';
}

const mockPresenceMilestones: PresenceMilestone[] = [
  { id: 'm1', date: '2026-01-15', description: 'Completed "Gravitas & Charisma" workshop', type: 'Training' },
  { id: 'm2', date: '2026-03-01', description: 'Received positive feedback on presentation clarity from CEO', type: 'Feedback' },
  { id: 'm3', date: '2026-04-10', description: 'Successfully led Q1 investor call with confidence', type: 'Achievement' },
  { id: 'm4', date: '2026-05-20', description: 'Identified as a top 5 emerging leader by HR', type: 'Achievement' },
];

const ExecutivePresenceTimeline = () => {
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Executive Presence Timeline
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <List>
          {mockPresenceMilestones.map((milestone) => (
            <ListItem key={milestone.id}>
              <ListItemIcon>
                {milestone.type === 'Achievement' ? <CheckCircleIcon color="success" /> : <TimelineIcon />}
              </ListItemIcon>
              <ListItemText
                primary={milestone.description}
                secondary={`${milestone.date} - Type: ${milestone.type}`}
              />
            </ListItem>
          ))}
        </List>
      </Paper>
    </Box>
  );
};

export default ExecutivePresenceTimeline;


