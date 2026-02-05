import React, { useState } from 'react';
import { Box, Typography, Paper, List, ListItem, ListItemText, FormControlLabel, Switch, Button, TextField, Grid } from '@mui/material/index.js';

interface ResponsibleGamblingCenterProps {
  onSetLimits: (dailyLimit: number, weeklyLimit: number) => void;
  onReportConcerns: () => void;
}

const ResponsibleGamblingCenter: React.FC<ResponsibleGamblingCenterProps> = ({
  onSetLimits,
  onReportConcerns
}) => {
  const [dailyLimit, setDailyLimit] = useState<number | ''>(100);
  const [weeklyLimit, setWeeklyLimit] = useState<number | ''>(500);
  const [selfExclusion, setSelfExclusion] = useState<boolean>(false);
  const [timeLimit, setTimeLimit] = useState<number | ''>(60);

  const handleSaveSettings = () => {
    if (typeof dailyLimit === 'number' && typeof weeklyLimit === 'number') {
      onSetLimits(dailyLimit, weeklyLimit);
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Responsible Gambling Center
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid xs={12} item>
            <Typography variant="h6" gutterBottom>
              Set Your Limits
            </Typography>
            <List>
              <ListItem>
                <ListItemText primary="Daily Betting Limit" secondary="Maximum amount per day." />
                <TextField
                  label="Amount ($)"
                  type="number"
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value === '' ? '' : Number(e.target.value))}
                  inputProps={{ min: 0 }}
                  sx={{ ml: 2 }}
                />
              </ListItem>
              <ListItem>
                <ListItemText primary="Weekly Betting Limit" secondary="Maximum amount per week." />
                <TextField
                  label="Amount ($)"
                  type="number"
                  value={weeklyLimit}
                  onChange={(e) => setWeeklyLimit(e.target.value === '' ? '' : Number(e.target.value))}
                  inputProps={{ min: 0 }}
                  sx={{ ml: 2 }}
                />
              </ListItem>
              <ListItem>
                <ListItemText primary="Session Time Limit" secondary="Get an alert after a time period." />
                <TextField
                  label="Minutes"
                  type="number"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(e.target.value === '' ? '' : Number(e.target.value))}
                  inputProps={{ min: 0 }}
                  sx={{ ml: 2 }}
                />
              </ListItem>
              <ListItem>
                <ListItemText primary="Self-Exclusion" secondary="Temporarily block betting access." />
                <FormControlLabel
                  control={<Switch checked={selfExclusion} onChange={(e) => setSelfExclusion(e.target.checked)} />}
                  label={selfExclusion ? 'Enabled' : 'Disabled'}
                  sx={{ ml: 2 }}
                />
              </ListItem>
            </List>
            <Button
              variant="contained"
              onClick={handleSaveSettings}
              sx={{ mt: 2 }}
              fullWidth
            >
              Save Settings
            </Button>
          </Grid>
          <Grid xs={12} item>
            <Typography variant="h6" gutterBottom>
              Need Help?
            </Typography>
            <Button
              variant="outlined"
              color="error"
              onClick={onReportConcerns}
              fullWidth
              sx={{ mb: 2 }}
            >
              Report Concerns
            </Button>
            <List>
              <ListItem>
                <ListItemText 
                  primary="National Council on Problem Gambling"
                  secondary="Helpline: 1-800-522-4700"
                />
              </ListItem>
              <ListItem>
                <ListItemText 
                  primary="Gamblers Anonymous"
                  secondary="Find a meeting near you at gamblersanonymous.org"
                />
              </ListItem>
              <ListItem>
                <ListItemText 
                  primary="SAMHSA National Helpline"
                  secondary="1-800-662-4357 (free, confidential, 24/7)"
                />
              </ListItem>
            </List>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default ResponsibleGamblingCenter;


