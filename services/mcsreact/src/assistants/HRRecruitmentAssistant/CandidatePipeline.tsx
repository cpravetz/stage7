import React from 'react';
import { Box, Typography, Paper, Grid, List, ListItem, ListItemText, Chip } from '@mui/material/index.js';
import { Candidate } from './types';

const mockCandidates: Candidate[] = [
  { id: 'c1', name: 'Alice Wonderland', email: 'alice@example.com', stage: 'Interviewing', score: 85 },
  { id: 'c2', name: 'Bob The Builder', email: 'bob@example.com', stage: 'Applied', score: 70 },
  { id: 'c3', name: 'Charlie Chaplin', email: 'charlie@example.com', stage: 'Offer Extended', score: 92 },
  { id: 'c4', name: 'Diana Prince', email: 'diana@example.com', stage: 'Hired', score: 95 },
  { id: 'c5', name: 'Eve Harrington', email: 'eve@example.com', stage: 'Rejected', score: 60 },
  { id: 'c6', name: 'Frankenstein', email: 'frank@example.com', stage: 'Applied', score: 75 },
];

const getStageColor = (stage: Candidate['stage']) => {
  switch (stage) {
    case 'Applied': return 'default';
    case 'Interviewing': return 'info';
    case 'Offer Extended': return 'warning';
    case 'Hired': return 'success';
    case 'Rejected': return 'error';
    default: return 'default';
  }
};

const CandidatePipeline = () => {
  const candidatesByStage = mockCandidates.reduce((acc, candidate) => {
    (acc[candidate.stage] = acc[candidate.stage] || []).push(candidate);
    return acc;
  }, {} as Record<Candidate['stage'], Candidate[]>);

  const stages: Candidate['stage'][] = ['Applied', 'Interviewing', 'Offer Extended', 'Hired', 'Rejected'];

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Candidate Pipeline
      </Typography>
      <Grid container spacing={3}>
        {stages.map((stage) => (
          <Grid {...({ xs: 12, sm: 6, md: 3, key: stage, item: true } as any)}>
            <Paper elevation={2} sx={{ p: 2, height: '100%' }}>
              <Typography variant="h6" gutterBottom>
                {stage} ({candidatesByStage[stage]?.length || 0})
              </Typography>
              <List>
                {candidatesByStage[stage]?.map((candidate) => (
                  <ListItem key={candidate.id} disablePadding>
                    <ListItemText
                      primary={candidate.name}
                      secondary={`Score: ${candidate.score}`}
                    />
                  </ListItem>
                ))}
              </List>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default CandidatePipeline;


