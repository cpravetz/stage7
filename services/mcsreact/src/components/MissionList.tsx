import React from 'react';
import { List, ListItem, ListItemText, Button, Paper, Typography } from '@mui/material';
import { Mission } from '@cktmcs/shared';

interface MissionListProps {
  missions: Partial<Mission>[];
  onMissionSelect: (missionId: string) => void;
  onClose: () => void;
}

const MissionList: React.FC<MissionListProps> = ({ missions, onMissionSelect, onClose }) => {
  return (
    <Paper elevation={3} sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Available Missions
      </Typography>
      <List>
        {missions.map((mission) => (
          <ListItem key={mission.id} secondaryAction={
            <Button edge="end" onClick={() => onMissionSelect(mission.id!)}>
              Load
            </Button>
          }>
            <ListItemText
              primary={mission.name}
              secondary={`Status: ${mission.status} - Goal: ${mission.goal}`}
            />
          </ListItem>
        ))}
      </List>
      <Button onClick={onClose} sx={{ mt: 2 }}>
        Close
      </Button>
    </Paper>
  );
};

export default MissionList;