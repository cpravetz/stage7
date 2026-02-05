import React from 'react';
import { Box, Typography, Paper, List, ListItem, ListItemText, Button, Grid, Chip } from '@mui/material/index.js';
import { CareerDevelopmentPlan } from '../types';

interface CareerDevelopmentProps {
  developmentPlans: CareerDevelopmentPlan[];
  onAddPlan: () => void;
  onUpdatePlanStatus: (planId: string, newStatus: CareerDevelopmentPlan['status']) => void;
  onViewResources: (planId: string) => void;
}

const CareerDevelopment: React.FC<CareerDevelopmentProps> = ({
  developmentPlans,
  onAddPlan,
  onUpdatePlanStatus,
  onViewResources,
}) => {
  const getStatusColor = (status: CareerDevelopmentPlan['status']) => {
    switch (status) {
      case 'Not Started': return 'default';
      case 'In Progress': return 'info';
      case 'Completed': return 'success';
      default: return 'default';
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Career Development and Networking
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
          <Button variant="contained" onClick={onAddPlan}>
            Create New Development Plan
          </Button>
        </Box>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              My Development Plans
            </Typography>
            {developmentPlans.length > 0 ? (
              <List>
                {developmentPlans.map((plan) => (
                  <ListItem key={plan.id} divider>
                    <ListItemText
                      primary={plan.goal}
                      secondary={
                        <React.Fragment>
                          <Typography component="span" variant="body2" color="text.primary">
                            Due: {plan.dueDate}
                          </Typography>
                          <br />
                          Action Items: {plan.actionItems.join(', ')}
                          <br />
                          Status: <Chip label={plan.status} color={getStatusColor(plan.status)} size="small" sx={{ mt: 0.5 }} />
                        </React.Fragment>
                      }
                    />
                    <Button
                      variant="outlined"
                      size="small"
                      sx={{ mr: 1 }}
                      onClick={() => onUpdatePlanStatus(plan.id, 'In Progress')}
                      disabled={plan.status === 'Completed'}
                    >
                      Mark In Progress
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      color="success"
                      onClick={() => onUpdatePlanStatus(plan.id, 'Completed')}
                      disabled={plan.status === 'Completed'}
                    >
                      Mark Completed
                    </Button>
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No career development plans defined yet.
              </Typography>
            )}
          </Grid>
          <Grid {...({ xs: 12, item: true } as any)}>
            <Typography variant="h6" gutterBottom sx={{ mt: 4 }}>
              Networking Resources
            </Typography>
            <List>
              <ListItem button>
                <ListItemText primary="LinkedIn Optimization Guide" />
              </ListItem>
              <ListItem button>
                <ListItemText primary="Professional Event Calendar" />
              </ListItem>
            </List>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default CareerDevelopment;


