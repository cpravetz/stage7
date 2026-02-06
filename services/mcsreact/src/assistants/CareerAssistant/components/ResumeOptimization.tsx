import React from 'react';
import { Box, Typography, Paper, List, ListItem, ListItemText, Button, Grid, Chip } from '@mui/material/index.js';

interface ResumeOptimizationProps {
  currentResume: string | null;
  targetJobDescription: string | null;
  optimizedResumeContent: string | null;
  optimizationSuggestions: string[];
  onUploadResume: () => void;
  onSetTargetJob: () => void;
  onOptimize: () => void;
  onApprove: () => void;
}

const ResumeOptimization: React.FC<ResumeOptimizationProps> = ({
  currentResume,
  targetJobDescription,
  optimizedResumeContent,
  optimizationSuggestions,
  onUploadResume,
  onSetTargetJob,
  onOptimize,
  onApprove,
}) => {
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Resume and Application Optimization
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Your Resume & Target Job
            </Typography>
            <List dense>
              <ListItem>
                <ListItemText
                  primary="Current Resume"
                  secondary={currentResume ? "Uploaded" : "No resume uploaded"}
                />
                <Button variant="outlined" size="small" onClick={onUploadResume}>
                  {currentResume ? "Re-upload" : "Upload"}
                </Button>
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Target Job Description"
                  secondary={targetJobDescription ? "Provided" : "No target job provided"}
                />
                <Button variant="outlined" size="small" onClick={onSetTargetJob}>
                  {targetJobDescription ? "Change Job" : "Provide Job"}
                </Button>
              </ListItem>
            </List>
            <Button
              variant="contained"
              fullWidth
              sx={{ mt: 2 }}
              onClick={onOptimize}
              disabled={!currentResume || !targetJobDescription}
            >
              Optimize My Application
            </Button>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Optimization Results & Suggestions
            </Typography>
            {optimizedResumeContent ? (
              <Box>
                <Typography variant="subtitle1" gutterBottom>
                  Optimized Content Preview:
                </Typography>
                <Paper variant="outlined" sx={{ p: 1, mb: 2, maxHeight: 150, overflowY: 'auto' }}>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {optimizedResumeContent}
                  </Typography>
                </Paper>
                <Button variant="contained" fullWidth onClick={onApprove} sx={{ mb: 2 }}>
                  Approve & Finalize
                </Button>
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Upload your resume and provide a target job description to get optimization suggestions.
              </Typography>
            )}
            {optimizationSuggestions.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle1" gutterBottom>
                  Suggestions:
                </Typography>
                <List dense>
                  {optimizationSuggestions.map((suggestion, index) => (
                    <ListItem key={index}>
                      <Chip label={suggestion} size="small" color="info" />
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default ResumeOptimization;


