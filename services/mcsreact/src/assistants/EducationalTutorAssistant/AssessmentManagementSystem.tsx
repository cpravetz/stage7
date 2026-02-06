import React from 'react';
import { Box, Typography, Paper, TextField, Button, List, ListItem, ListItemText, Grid, Alert } from '@mui/material/index.js';
import { Assessment } from './types';
import { educationAssistantClient } from '../shared/assistantClients'; // Fixed import to use correct exported name

interface AssessmentManagementSystemProps {
  assessments: Assessment[];
  conversationId: string | null;
  client: typeof educationAssistantClient;
  setError: (error: string | null) => void;
}

const AssessmentManagementSystem: React.FC<AssessmentManagementSystemProps> = ({ assessments, conversationId, client, setError }) => {
  // The 'assessments' state is now managed by the parent component and passed as a prop.
  // The 'newAssessment' state and related logic for adding assessments are removed as this component will primarily display.
  // Future enhancements would integrate 'newAssessment' with the client for backend interaction.

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Assessment Management System
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          {/* Add New Assessment Section (placeholder for future implementation) */}
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Add New Assessment (Future Feature)
            </Typography>
            <Alert severity="info">
              Assessment creation will be implemented via the Educational Tutor Assistant.
            </Alert>
            <TextField
              label="Topic/Assessment Name"
              fullWidth
              // value={newAssessment.topic} // Removed
              // onChange={(e) => setNewAssessment({ ...newAssessment, topic: e.target.value })} // Removed
              sx={{ mb: 2 }}
              disabled
            />
            <TextField
              label="Score"
              type="number"
              fullWidth
              // value={newAssessment.score} // Removed
              // onChange={(e) => setNewAssessment({ ...newAssessment, score: Number(e.target.value) })} // Removed
              sx={{ mb: 2 }}
              disabled
            />
            <TextField
              label="Max Score"
              type="number"
              fullWidth
              // value={newAssessment.maxScore} // Removed
              // onChange={(e) => setNewAssessment({ ...newAssessment, maxScore: Number(e.target.value) })} // Removed
              sx={{ mb: 2 }}
              disabled
            />
            <TextField
              label="Date (YYYY-MM-DD)"
              fullWidth
              // value={newAssessment.date} // Removed
              // onChange={(e) => setNewAssessment({ ...newAssessment, date: e.target.value })} // Removed
              sx={{ mb: 2 }}
              disabled
            />
            <Button variant="contained" /* onClick={handleAddAssessment} */ fullWidth disabled>
              Add Assessment
            </Button>
          </Grid>
          {/* Existing Assessments Section */}
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Existing Assessments
            </Typography>
            <List>
              {assessments.length > 0 ? (
                assessments.map((assessment) => (
                  <ListItem key={assessment.id} divider>
                    <ListItemText
                      primary={assessment.topic}
                      secondary={`Score: ${assessment.score}/${assessment.maxScore} on ${assessment.date}`}
                    />
                  </ListItem>
                ))
              ) : (
                <ListItem>
                  <ListItemText primary="No assessments found." secondary="Assessments will appear here once retrieved from the system." />
                </ListItem>
              )}
            </List>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default AssessmentManagementSystem;


