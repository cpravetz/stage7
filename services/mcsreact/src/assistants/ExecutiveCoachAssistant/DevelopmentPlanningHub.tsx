import React, { useState } from 'react';
import { Box, Typography, Paper, TextField, Button, List, ListItem, ListItemText, Grid, Select, MenuItem, FormControl, InputLabel } from '@mui/material/index.js';
import { DevelopmentPlan } from './types';

const mockDevelopmentPlans: DevelopmentPlan[] = [
  { id: 'dp1', goal: 'Improve Strategic Thinking', status: 'In Progress', dueDate: '2026-06-30', actionItems: ['Read "Good Strategy Bad Strategy"', 'Attend "Future Trends" workshop'] },
  { id: 'dp2', goal: 'Enhance Communication Skills', status: 'Not Started', dueDate: '2026-09-30', actionItems: ['Enroll in public speaking course', 'Seek peer feedback'] },
];

interface DevelopmentPlanningHubProps {
  plans: DevelopmentPlan[];
  onCreatePlan?: (plan: Omit<DevelopmentPlan, 'id' | 'actionItems'>) => void;
  onUpdatePlan?: (planId: string, updates: Partial<DevelopmentPlan>) => void;
}

const DevelopmentPlanningHub: React.FC<DevelopmentPlanningHubProps> = ({ plans, onCreatePlan, onUpdatePlan }) => {
  const [internalPlans, setInternalPlans] = useState<DevelopmentPlan[]>(plans);
  const [newPlan, setNewPlan] = useState<Omit<DevelopmentPlan, 'id' | 'actionItems'>>({ goal: '', status: 'Not Started', dueDate: '' });
  const [newActionItem, setNewActionItem] = useState<string>('');
  const [currentPlanIdForAction, setCurrentPlanIdForAction] = useState<string | null>(null);

  const handleAddPlan = () => {
    if (newPlan.goal && newPlan.dueDate) {
      if (onCreatePlan) {
        onCreatePlan(newPlan);
      }
      setInternalPlans([...internalPlans, { ...newPlan, id: String(internalPlans.length + 1), actionItems: [] }]);
      setNewPlan({ goal: '', status: 'Not Started', dueDate: '' });
    }
  };

  const handleAddActionItem = () => {
    if (newActionItem && currentPlanIdForAction) {
      setInternalPlans(internalPlans.map(plan =>
        plan.id === currentPlanIdForAction ? { ...plan, actionItems: [...plan.actionItems, newActionItem] } : plan
      ));
      setNewActionItem('');
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Development Planning Hub
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Create New Development Plan
            </Typography>
            <TextField
              label="Goal"
              fullWidth
              value={newPlan.goal}
              onChange={(e) => setNewPlan({ ...newPlan, goal: e.target.value })}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Due Date (YYYY-MM-DD)"
              fullWidth
              value={newPlan.dueDate}
              onChange={(e) => setNewPlan({ ...newPlan, dueDate: e.target.value })}
              sx={{ mb: 2 }}
            />
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel id="status-select-label">Status</InputLabel>
              <Select
                labelId="status-select-label"
                value={newPlan.status}
                label="Status"
                onChange={(e) => setNewPlan({ ...newPlan, status: e.target.value as DevelopmentPlan['status'] })}
              >
                <MenuItem value="Not Started">Not Started</MenuItem>
                <MenuItem value="In Progress">In Progress</MenuItem>
                <MenuItem value="Completed">Completed</MenuItem>
              </Select>
            </FormControl>
            <Button variant="contained" onClick={handleAddPlan} fullWidth>
              Add Development Plan
            </Button>

            <Typography variant="h6" gutterBottom sx={{ mt: 4 }}>
              Add Action Item to Plan
            </Typography>
            <TextField
              label="New Action Item"
              fullWidth
              value={newActionItem}
              onChange={(e) => setNewActionItem(e.target.value)}
              sx={{ mb: 2 }}
            />
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel id="plan-select-label">Select Plan</InputLabel>
              <Select
                labelId="plan-select-label"
                value={currentPlanIdForAction || ''}
                label="Select Plan"
                onChange={(e) => setCurrentPlanIdForAction(e.target.value as string)}
              >
                {internalPlans.map((plan) => (
                  <MenuItem key={plan.id} value={plan.id}>
                    {plan.goal}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button variant="contained" onClick={handleAddActionItem} fullWidth disabled={!currentPlanIdForAction}>
              Add Action Item
            </Button>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Current Development Plans
            </Typography>
            <List>
              {internalPlans.map((plan) => (
                <ListItem key={plan.id} divider>
                  <ListItemText
                    primary={plan.goal}
                    secondary={
                      <React.Fragment>
                        <Typography component="span" variant="body2" color="text.primary">
                          Status: {plan.status} | Due: {plan.dueDate}
                        </Typography>
                        <br />
                        Action Items: {plan.actionItems.join(', ') || 'None'}
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

export default DevelopmentPlanningHub;


