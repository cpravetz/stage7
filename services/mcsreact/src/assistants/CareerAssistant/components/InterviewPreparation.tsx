import React from 'react';
import { Box, Typography, Paper, List, ListItem, ListItemText, Button, Grid } from '@mui/material/index.js';
import { InterviewSession } from '../types';

interface InterviewPreparationProps {
  upcomingInterviews: InterviewSession[];
  onScheduleInterview: () => void;
  onReviewFeedback: (sessionId: string) => void;
  onConductMockInterview: (sessionId: string) => void;
}

const InterviewPreparation: React.FC<InterviewPreparationProps> = ({
  upcomingInterviews,
  onScheduleInterview,
  onReviewFeedback,
  onConductMockInterview,
}) => {
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Interview Preparation and Coaching
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Upcoming Interviews
            </Typography>
            {upcomingInterviews.length > 0 ? (
              <List>
                {upcomingInterviews.map((session) => (
                  <ListItem key={session.id} divider>
                    <ListItemText
                      primary={`Job ID: ${session.jobId} - ${session.interviewer}`}
                      secondary={`Date: ${session.date} | Feedback: ${session.feedback || 'N/A'}`}
                    />
                    <Button
                      variant="outlined"
                      size="small"
                      sx={{ mr: 1 }}
                      onClick={() => onConductMockInterview(session.id)}
                    >
                      Mock Interview
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => onReviewFeedback(session.id)}
                    >
                      Review
                    </Button>
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No upcoming interviews tracked.
              </Typography>
            )}
            <Button variant="contained" fullWidth sx={{ mt: 2 }} onClick={onScheduleInterview}>
              Schedule New Interview Prep
            </Button>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Interview Resources
            </Typography>
            <List>
              <ListItem button>
                <ListItemText primary="Common Behavioral Questions" />
              </ListItem>
              <ListItem button>
                <ListItemText primary="STAR Method Guide" />
              </ListItem>
              <ListItem button>
                <ListItemText primary="Company Research Template" />
              </ListItem>
            </List>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default InterviewPreparation;


