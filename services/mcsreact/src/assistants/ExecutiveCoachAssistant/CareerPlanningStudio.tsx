import React, { useState } from 'react';
import { Box, Typography, Paper, TextField, Button, List, ListItem, ListItemText, Grid, Chip, FormControl, InputLabel, Select, MenuItem, ListItemIcon } from '@mui/material/index.js';
import {CheckCircle as CheckCircleIcon} from '@mui/icons-material';

interface CareerGoal {
  id: string;
  goal: string;
  targetRole: string;
  steps: string[];
  status: 'Not Started' | 'In Progress' | 'Completed';
}

const mockCareerGoals: CareerGoal[] = [
  { id: 'cg1', goal: 'Become a VP of Product', targetRole: 'VP of Product', steps: ['Lead a major product initiative', 'Mentor junior product managers', 'Complete executive leadership program'], status: 'In Progress' },
  { id: 'cg2', goal: 'Start own consulting firm', targetRole: 'Independent Consultant', steps: ['Build client network', 'Develop service offerings', 'Secure initial contracts'], status: 'Not Started' },
];

const CareerPlanningStudio = () => {
  const [goals, setGoals] = useState<CareerGoal[]>(mockCareerGoals);
  const [newGoal, setNewGoal] = useState<Omit<CareerGoal, 'id' | 'steps' | 'status'>>({ goal: '', targetRole: '' });
  const [newStep, setNewStep] = useState<string>('');
  const [currentGoalIdForStep, setCurrentGoalIdForStep] = useState<string | null>(null);

  const handleAddGoal = () => {
    if (newGoal.goal && newGoal.targetRole) {
      setGoals([...goals, { ...newGoal, id: String(goals.length + 1), steps: [], status: 'Not Started' }]);
      setNewGoal({ goal: '', targetRole: '' });
    }
  };

  const handleAddStep = () => {
    if (newStep && currentGoalIdForStep) {
      setGoals(goals.map(goal =>
        goal.id === currentGoalIdForStep ? { ...goal, steps: [...goal.steps, newStep] } : goal
      ));
      setNewStep('');
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Career Planning Studio
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Define New Career Goal
            </Typography>
            <TextField
              label="Career Goal"
              fullWidth
              value={newGoal.goal}
              onChange={(e) => setNewGoal({ ...newGoal, goal: e.target.value })}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Target Role"
              fullWidth
              value={newGoal.targetRole}
              onChange={(e) => setNewGoal({ ...newGoal, targetRole: e.target.value })}
              sx={{ mb: 2 }}
            />
            <Button variant="contained" onClick={handleAddGoal} fullWidth>
              Add Career Goal
            </Button>

            <Typography variant="h6" gutterBottom sx={{ mt: 4 }}>
              Add Steps to Goal
            </Typography>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel id="goal-select-label">Select Goal</InputLabel>
              <Select
                labelId="goal-select-label"
                value={currentGoalIdForStep || ''}
                label="Select Goal"
                onChange={(e) => setCurrentGoalIdForStep(e.target.value as string)}
              >
                {goals.map((goal) => (
                  <MenuItem key={goal.id} value={goal.id}>
                    {goal.goal}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="New Action Step"
              fullWidth
              value={newStep}
              onChange={(e) => setNewStep(e.target.value)}
              sx={{ mb: 2 }}
            />
            <Button variant="contained" onClick={handleAddStep} fullWidth disabled={!currentGoalIdForStep}>
              Add Step
            </Button>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Your Career Goals
            </Typography>
            <List>
              {goals.map((goal) => (
                <ListItem key={goal.id} divider>
                  <ListItemText
                    primary={goal.goal}
                    secondary={
                      <React.Fragment>
                        <Typography component="span" variant="body2" color="text.primary">
                          Target Role: {goal.targetRole}
                        </Typography>
                        <br />
                        Status: <Chip label={goal.status} size="small" color={goal.status === 'Completed' ? 'success' : 'default'} />
                        <br />
                        Steps:
                        <List dense disablePadding>
                          {goal.steps.map((step, index) => (
                            <ListItem key={index} disablePadding>
                              <ListItemIcon sx={{ minWidth: 30 }}><CheckCircleIcon fontSize="small" /></ListItemIcon>
                              <ListItemText primary={step} />
                            </ListItem>
                          ))}
                        </List>
                      </React.Fragment>
                    }
                  />
                </ListItem>
              ))}
            </List>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};


export default CareerPlanningStudio;


