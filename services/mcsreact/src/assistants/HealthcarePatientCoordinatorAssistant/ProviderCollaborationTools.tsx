import React from 'react';
import { Box, Typography, Paper, Button, Grid, List, ListItem, ListItemText, ListItemIcon } from '@mui/material/index.js';
import {MeetingRoom as MeetingRoomIcon, Chat as ChatIcon, Share as ShareIcon} from '@mui/icons-material';

interface ProviderCollaborationToolsProps {
  onShareWithProvider?: (shareData: any) => void;
  onRequestConsultation?: (consultationData: any) => void;
}

const ProviderCollaborationTools: React.FC<ProviderCollaborationToolsProps> = ({ onShareWithProvider, onRequestConsultation }) => {
  const handleLaunchMeeting = () => {
    onRequestConsultation?.({ type: 'meeting' });
  };

  const handleOpenSecureChat = () => {
    onShareWithProvider?.({ type: 'chat' });
  };

  const handleSharePatientData = () => {
    onShareWithProvider?.({ type: 'data_share' });
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Provider Collaboration Tools
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 4, item: true } as any)}>
            <Button
              variant="contained"
              fullWidth
              startIcon={<MeetingRoomIcon />}
              onClick={handleLaunchMeeting}
              sx={{ height: '100%' }}
            >
              Launch Virtual Meeting
            </Button>
          </Grid>
          <Grid {...({ xs: 12, md: 4, item: true } as any)}>
            <Button
              variant="contained"
              fullWidth
              startIcon={<ChatIcon />}
              onClick={handleOpenSecureChat}
              sx={{ height: '100%' }}
            >
              Open Secure Chat
            </Button>
          </Grid>
          <Grid {...({ xs: 12, md: 4, item: true } as any)}>
            <Button
              variant="contained"
              fullWidth
              startIcon={<ShareIcon />}
              onClick={handleSharePatientData}
              sx={{ height: '100%' }}
            >
              Share Patient Data
            </Button>
          </Grid>
        </Grid>

        <Typography variant="h6" gutterBottom sx={{ mt: 4 }}>
          Recent Collaborations
        </Typography>
        <List>
          <ListItem>
            <ListItemIcon><ChatIcon /></ListItemIcon>
            <ListItemText primary="Discussion on John Doe's care plan - 1 day ago" secondary="Coordinated medication adjustments." />
          </ListItem>
          <ListItem>
            <ListItemIcon><MeetingRoomIcon /></ListItemIcon>
            <ListItemText primary="Case Review: Jane Smith - 3 days ago" secondary="Reviewed progress and next steps." />
          </ListItem>
        </List>
      </Paper>
    </Box>
  );
};

export default ProviderCollaborationTools;


