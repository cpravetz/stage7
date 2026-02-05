import React from 'react';
import { Box, Typography, Paper, Grid, List, ListItem, ListItemText, LinearProgress } from '@mui/material/index.js';
import { AssessmentResult } from './types';

interface LeadershipAssessmentCenterProps {
  assessments: AssessmentResult[];
  onStartAssessment?: () => void;
  onUpdateAssessment?: (assessmentId: string, updates: Partial<AssessmentResult>) => void;
}

const LeadershipAssessmentCenter: React.FC<LeadershipAssessmentCenterProps> = ({ assessments, onStartAssessment, onUpdateAssessment }) => {
  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Leadership Assessment Center
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          {assessments.map((result) => (
            <Grid {...({ xs: 12, sm: 6, md: 4, key: result.id, item: true } as any)}>
              <Paper elevation={1} sx={{ p: 2, height: '100%' }}>
                <Typography variant="h6" gutterBottom>{result.name}</Typography>
                <Typography variant="body2" color="text.secondary">{result.category}</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                  <LinearProgress
                    variant="determinate"
                    value={(result.score / result.maxScore) * 100}
                    sx={{ flexGrow: 1, mr: 1 }}
                  />
                  <Typography variant="body2">{result.score}/{result.maxScore}</Typography>
                </Box>
                <Typography variant="body2" sx={{ mt: 1 }}>{result.feedback}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Paper>
    </Box>
  );
};

export default LeadershipAssessmentCenter;


