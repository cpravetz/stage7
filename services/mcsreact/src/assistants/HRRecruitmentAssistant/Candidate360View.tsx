import React from 'react';
import { Box, Typography, Paper, Grid, List, ListItem, ListItemText, Divider } from '@mui/material/index.js';
import { Candidate } from './types'; // Import Candidate from local types

interface CandidateDetails {
  id: string;
  name: string;
  email: string;
  phone: string;
  positionApplied: string;
  applicationHistory: string[]; // e.g., dates of application, resume submission
  interviewNotes: string[]; // e.g., feedback from interviewers
  assessmentResults: string[]; // e.g., scores from coding tests, personality assessments
}

const mockCandidate: CandidateDetails = {
  id: 'cand123',
  name: 'Alice Wonderland',
  email: 'alice@example.com',
  phone: '+1 (555) 111-2222',
  positionApplied: 'Software Engineer (Senior)',
  applicationHistory: [
    'Applied on 2026-02-01 for Software Engineer (Senior).',
    'Resume reviewed on 2026-02-05.',
    'Interview scheduled for 2026-02-10.',
  ],
  interviewNotes: [
    'Technical Interview (2026-02-10): Strong problem-solving skills, good understanding of data structures.',
    'Behavioral Interview (2026-02-12): Excellent teamwork and communication, good cultural fit.',
  ],
  assessmentResults: [
    'Coding Challenge: 90/100',
    'Personality Assessment: Strong analytical and leadership traits.',
  ],
};

const Candidate360View = () => {
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Candidate 360 View
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Candidate Details
            </Typography>
            <List dense>
              <ListItem>
                <ListItemText primary="Name" secondary={mockCandidate.name} />
              </ListItem>
              <ListItem>
                <ListItemText primary="Position Applied" secondary={mockCandidate.positionApplied} />
              </ListItem>
              <ListItem>
                <ListItemText primary="Email" secondary={mockCandidate.email} />
              </ListItem>
              <ListItem>
                <ListItemText primary="Phone" secondary={mockCandidate.phone} />
              </ListItem>
            </List>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Application History
            </Typography>
            <List dense>
              {mockCandidate.applicationHistory.map((entry, index) => (
                <ListItem key={index}>
                  <ListItemText primary={entry} />
                </ListItem>
              ))}
            </List>
            <Divider sx={{ my: 2 }} />
            <Typography variant="h6" gutterBottom>
              Interview Notes
            </Typography>
            <List dense>
              {mockCandidate.interviewNotes.map((note, index) => (
                <ListItem key={index}>
                  <ListItemText primary={note} />
                </ListItem>
              ))}
            </List>
            <Divider sx={{ my: 2 }} />
            <Typography variant="h6" gutterBottom>
              Assessment Results
            </Typography>
            <List dense>
              {mockCandidate.assessmentResults.map((result, index) => (
                <ListItem key={index}>
                  <ListItemText primary={result} />
                </ListItem>
              ))}
            </List>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default Candidate360View;


