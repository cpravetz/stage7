import React from 'react';
import { Box, Typography, Paper, List, ListItem, ListItemText, ListItemIcon } from '@mui/material/index.js';
import {SpeakerNotes as SpeakerNotesIcon} from '@mui/icons-material';
import {Feedback as FeedbackIcon} from '@mui/icons-material';

interface CommunicationFeedback {
  id: string;
  type: 'Verbal' | 'Written' | 'Presentation';
  feedback: string;
  suggestion: string;
}

const mockFeedback: CommunicationFeedback[] = [
  { id: '1', type: 'Verbal', feedback: 'Used too many filler words ("um", "uh") during the team meeting.', suggestion: 'Practice pausing instead of filling silence with filler words.' },
  { id: '2', type: 'Written', feedback: 'Email to stakeholders lacked a clear call to action.', suggestion: 'Ensure all key communications have a clear, concise next step for the recipient.' },
  { id: '3', type: 'Presentation', feedback: 'Main message was lost due to too much detail on early slides.', suggestion: 'Prioritize key takeaways and use supporting details only where necessary.' },
];

const CommunicationCoachingCenter = () => {
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Communication Coaching Center
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Your Communication Feedback
        </Typography>
        <List>
          {mockFeedback.map((item) => (
            <ListItem key={item.id} divider>
              <ListItemIcon>
                <FeedbackIcon color="action" />
              </ListItemIcon>
              <ListItemText
                primary={<Typography variant="subtitle1">{item.type} Feedback</Typography>}
                secondary={
                  <React.Fragment>
                    <Typography component="span" variant="body2" color="text.primary">
                      {item.feedback}
                    </Typography>
                    <br />
                    <Typography component="span" variant="body2" color="text.secondary">
                      Suggestion: {item.suggestion}
                    </Typography>
                  </React.Fragment>
                }
              />
            </ListItem>
          ))}
        </List>

        <Typography variant="h6" gutterBottom sx={{ mt: 4 }}>
          Communication Resources
        </Typography>
        <List>
          <ListItem>
            <ListItemIcon><SpeakerNotesIcon /></ListItemIcon>
            <ListItemText primary="Public Speaking Course Recommendations" secondary="Courses to improve verbal delivery and confidence." />
          </ListItem>
          <ListItem>
            <ListItemIcon><SpeakerNotesIcon /></ListItemIcon>
            <ListItemText primary="Effective Business Writing Guides" secondary="Tips for clear, concise, and persuasive written communication." />
          </ListItem>
        </List>
      </Paper>
    </Box>
  );
};

export default CommunicationCoachingCenter;


