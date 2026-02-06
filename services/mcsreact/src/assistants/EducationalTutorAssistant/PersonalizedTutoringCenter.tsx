import React from 'react';
import { Box, Typography, Paper, List, ListItem, ListItemText, Chip, Grid } from '@mui/material/index.js';
// Removed EducationalTutorAssistantClient import as data is now passed via props

interface LearningPlanData {
  id: string;
  topic: string;
  level: string;
  status: 'Not Started' | 'In Progress' | 'Completed';
  dueDate: string;
  resources: string[];
}

interface PersonalizedTutoringCenterProps {
  learningPlans: LearningPlanData[];
  // Removed conversationId, client, setError as data is now passed via props
}

const PersonalizedTutoringCenter: React.FC<PersonalizedTutoringCenterProps> = ({ learningPlans }) => {
  // Removed internal state for learningPlans and isLoading as they are now managed by the parent
  // Removed useEffect for data fetching

  const getStatusColor = (status: LearningPlanData['status']) => {
    switch (status) {
      case 'Not Started': return 'default';
      case 'In Progress': return 'info';
      case 'Completed': return 'success';
      default: return 'default';
    }
  };

  // Removed isLoading conditional rendering as it's now handled by the parent component

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Personalized Tutoring Center
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          My Learning Plans
        </Typography>
        <List>
          {learningPlans.length > 0 ? (
            learningPlans.map((plan) => (
              <ListItem key={plan.id} divider>
                <Grid container alignItems="center">
                  <Grid {...({ xs: 12, sm: 8, item: true } as any)}>
                    <ListItemText
                      primary={plan.topic}
                      secondary={
                        <React.Fragment>
                          <Typography component="span" variant="body2" color="text.primary">
                            Level: {plan.level} | Due: {plan.dueDate}
                          </Typography>
                          <br />
                          Resources: {plan.resources.join(', ')}
                        </React.Fragment>
                      }
                    />
                  </Grid>
                  <Grid {...({ xs: 12, sm: 4, sx: { textAlign: { xs: 'left', sm: 'right' }}, item: true } as any)}>
                    <Chip label={plan.status} color={getStatusColor(plan.status)} />
                  </Grid>
                </Grid>
              </ListItem>
            ))
          ) : (
            <ListItem>
              <ListItemText primary="No personalized learning plans found." secondary="Learning plans will appear here once created." />
            </ListItem>
          )}
        </List>
      </Paper>
    </Box>
  );
};

export default PersonalizedTutoringCenter;


