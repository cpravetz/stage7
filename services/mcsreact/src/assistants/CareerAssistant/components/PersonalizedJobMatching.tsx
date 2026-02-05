import React from 'react';
import { Box, Typography, Paper, List, ListItem, ListItemText, Chip, Grid, Button } from '@mui/material/index.js';
import { JobListing, CareerProfile } from '../types';

interface PersonalizedJobMatchingProps {
  careerProfile: CareerProfile | null;
  jobListings: JobListing[];
  onApply: (jobId: string) => void;
  onUpdateProfile: () => void;
}

const PersonalizedJobMatching: React.FC<PersonalizedJobMatchingProps> = ({
  careerProfile,
  jobListings,
  onApply,
  onUpdateProfile,
}) => {
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Personalized Job Matching
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 4, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Your Career Profile
            </Typography>
            {careerProfile ? (
              <List dense>
                <ListItem>
                  <ListItemText primary="Name" secondary={careerProfile.name} />
                </ListItem>
                <ListItem>
                  <ListItemText primary="Experience" secondary={careerProfile.experience} />
                </ListItem>
                <ListItem>
                  <ListItemText primary="Goals" secondary={careerProfile.goals} />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Skills"
                    secondary={
                      <Box>
                        {careerProfile.skills.map((skill, index) => (
                          <Chip key={index} label={skill} size="small" sx={{ mr: 0.5, mb: 0.5 }} />
                        ))}
                      </Box>
                    }
                  />
                </ListItem>
                <ListItem>
                  <Button variant="outlined" size="small" onClick={onUpdateProfile}>
                    Update Profile
                  </Button>
                </ListItem>
              </List>
            ) : (
              <Box>
                <Typography variant="body2" color="text.secondary">
                  No career profile found.
                </Typography>
                <Button variant="contained" size="small" onClick={onUpdateProfile} sx={{ mt: 1 }}>
                  Create Profile
                </Button>
              </Box>
            )}
          </Grid>
          <Grid {...({ xs: 12, md: 8, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Recommended Job Listings
            </Typography>
            {jobListings.length > 0 ? (
              <List>
                {jobListings.map((job) => (
                  <ListItem key={job.id} divider>
                    <ListItemText
                      primary={job.title}
                      secondary={
                        <React.Fragment>
                          <Typography component="span" variant="body2" color="text.primary">
                            {job.company} - {job.location}
                          </Typography>
                          <br />
                          {job.description}
                          <br />
                          <Chip label={`Match: ${job.matchScore}%`} size="small" color="primary" sx={{ mt: 0.5 }} />
                        </React.Fragment>
                      }
                    />
                    <Button variant="outlined" size="small" onClick={() => onApply(job.id)}>
                      Apply
                    </Button>
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No job listings found matching your profile.
              </Typography>
            )}
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default PersonalizedJobMatching;


