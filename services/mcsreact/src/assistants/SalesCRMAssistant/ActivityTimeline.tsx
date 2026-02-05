import React from 'react';
import { Box, Typography, Paper, List, ListItem, ListItemText, ListItemIcon, Button, IconButton } from '@mui/material/index.js';
import {Event as EventIcon, Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon} from '@mui/icons-material';
import { SalesActivity } from './types';

interface ActivityTimelineProps {
  activities: SalesActivity[];
  onCreateActivity: (activity: SalesActivity) => void;
  onUpdateActivity: (id: string, updates: Partial<SalesActivity>) => void;
  sendMessage: (message: string) => void;
}

const ActivityTimeline: React.FC<ActivityTimelineProps> = ({ 
  activities, 
  onCreateActivity, 
  onUpdateActivity, 
  sendMessage 
}) => {
  const handleCreateActivity = () => {
    const newActivity: SalesActivity = {
      id: Date.now().toString(),
      type: 'Call',
      date: new Date().toISOString().split('T')[0],
      description: 'New sales activity',
      relatedTo: '',
      outcome: 'Pending'
    };
    onCreateActivity(newActivity);
  };

  const getActivityIcon = (type: SalesActivity['type']) => {
    switch (type) {
      case 'Call': return <EventIcon color="primary" />;
      case 'Email': return <EventIcon color="secondary" />;
      case 'Meeting': return <EventIcon color="success" />;
      case 'Demo': return <EventIcon color="info" />;
      default: return <EventIcon />;
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" gutterBottom>
          Activity Timeline
        </Typography>
        <Button 
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={handleCreateActivity}
          size="small"
        >
          Log Activity
        </Button>
      </Box>
      
      {activities.length === 0 ? (
        <Typography variant="body1" color="text.secondary">
          No activities recorded. Click "Log Activity" to add your first activity.
        </Typography>
      ) : (
        <Paper elevation={2} sx={{ p: 2 }}>
          <List>
            {activities.map((activity) => (
              <ListItem 
                key={activity.id}
                secondaryAction={
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <IconButton edge="end" aria-label="edit" onClick={() => sendMessage(`Edit activity ${activity.id}`)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton edge="end" aria-label="delete" onClick={() => onUpdateActivity(activity.id, { description: `[DELETED] ${activity.description}` })}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                }
              >
                <ListItemIcon>
                  {getActivityIcon(activity.type)}
                </ListItemIcon>
                <ListItemText
                  primary={`${activity.date}: ${activity.type}`}
                  secondary={
                    <React.Fragment>
                      <Typography component="span" variant="body2" color="text.primary">
                        {activity.description}
                      </Typography>
                      {activity.outcome && (
                        <React.Fragment>
                          <br />
                          <Typography component="span" variant="body2" color="text.secondary">
                            Outcome: {activity.outcome}
                          </Typography>
                        </React.Fragment>
                      )}
                    </React.Fragment>
                  }
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      )}
    </Box>
  );
};

export default ActivityTimeline;


