import React from 'react';
import { Box, Typography, Paper, List, ListItem, ListItemText, ListItemIcon, Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material/index.js';
import {Event as EventIcon, Add as AddIcon, Edit as EditIcon} from '@mui/icons-material';
import { CampaignPlannerData } from './types';

interface CampaignPlannerProps {
  plannerData: CampaignPlannerData[];
  onUpdatePlanner: (id: string, updates: Partial<CampaignPlannerData>) => void;
  sendMessage: (message: string) => Promise<any>;
}

const CampaignPlanner: React.FC<CampaignPlannerProps> = ({
  plannerData,
  onUpdatePlanner,
  sendMessage
}) => {
  const [openDialog, setOpenDialog] = React.useState(false);
  const [currentPlanner, setCurrentPlanner] = React.useState<CampaignPlannerData | null>(null);

  const handleEditClick = (planner: CampaignPlannerData) => {
    setCurrentPlanner(planner);
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setCurrentPlanner(null);
  };

  const handleSave = () => {
    if (currentPlanner) {
      onUpdatePlanner(currentPlanner.id, currentPlanner);
      handleCloseDialog();
    }
  };

  const handleAddNew = () => {
    sendMessage('Add new campaign planner');
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" gutterBottom>
          Interactive Campaign Planner
        </Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={handleAddNew}
        >
          Add Planner
        </Button>
      </Box>
      <Paper elevation={2} sx={{ p: 2 }}>
        <List>
          {plannerData.map((planner) => (
            <ListItem key={planner.id}>
              <ListItemIcon>
                <EventIcon />
              </ListItemIcon>
              <ListItemText
                primary={`Campaign ${planner.campaignId} Planner`}
                secondary={`Objectives: ${planner.objectives.join(', ')}`}
              />
              <Button
                variant="outlined"
                size="small"
                startIcon={<EditIcon />}
                onClick={() => handleEditClick(planner)}
              >
                Edit
              </Button>
            </ListItem>
          ))}
        </List>
      </Paper>

      <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="md">
        <DialogTitle>Edit Campaign Planner</DialogTitle>
        <DialogContent>
          {currentPlanner && (
            <Box sx={{ mt: 2 }}>
              <TextField
                label="Campaign ID"
                value={currentPlanner.campaignId}
                fullWidth
                margin="normal"
                disabled
              />
              <TextField
                label="Objectives"
                value={currentPlanner.objectives.join(', ')}
                fullWidth
                margin="normal"
                multiline
                rows={3}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} color="secondary">
            Cancel
          </Button>
          <Button onClick={handleSave} color="primary">
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CampaignPlanner;


