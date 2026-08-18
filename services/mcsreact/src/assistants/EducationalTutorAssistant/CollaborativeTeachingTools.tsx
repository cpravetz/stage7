import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Button, Grid, List, ListItem, ListItemText, ListItemIcon, CircularProgress, Alert } from '@mui/material/index.js';
import { Dashboard as DashboardIcon, Forum as ForumIcon,Share as ShareIcon } from '@mui/icons-material';
import { educationAssistantClient } from '../shared/assistantClients';

interface CollaborativeTeachingToolsProps {
  conversationId: string | null;
  client: {
    getContext: (conversationId: string) => Promise<{
      contextItems: Array<{
        id: string;
        type: string;
        title: string;
        preview: string;
        link: string;
        timestamp: string;
      }>;
    }>;
    sendMessage: (conversationId: string, message: string) => Promise<void>;
  };
  setError: (error: string | null) => void;
}

interface CollaborationLog {
  id: string;
  activity: string;
  details: string;
  icon: React.ReactElement;
}

// Extend the ContextItem interface to include optional metadata
interface ContextItem {
  id: string;
  type: string;
  title: string;
  preview: string;
  link: string;
  timestamp: Date | string;
  metadata?: {
    icon?: string;
    [key: string]: any; // Allow for additional metadata properties
  };
}

const CollaborativeTeachingTools: React.FC<CollaborativeTeachingToolsProps> = ({ conversationId, client, setError }) => {
  const [collaborations, setCollaborations] = useState<CollaborationLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCollaborations = async () => {
      if (!conversationId) return;
      setIsLoading(true);
      try {
        const contextData = await client.getContext(conversationId);
        const fetchedCollaborations = contextData.contextItems
          .filter(item => item.type === 'collaboration_log')
          .map(log => {
            let iconElement = <DashboardIcon />;
            if (log.title.includes('Forum')) {
              iconElement = <ForumIcon />;
            } else if (log.title.includes('Dashboard')) {
              iconElement = <DashboardIcon />;
            }
            return {
              id: log.id,
              activity: log.title,
              details: log.preview || '',
              icon: iconElement
            };
          });
        setCollaborations(fetchedCollaborations);
      } catch (err) {
        console.error('Error fetching collaborations:', err);
        setError('Failed to load recent collaborations.');
        setCollaborations([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchCollaborations();
  }, [conversationId, client]);

  const handleLaunchWhiteboard = async () => {
    if (!conversationId) {
      setError('No active conversation to launch whiteboard.');
      return;
    }
    try {
      await client.sendMessage(conversationId, 'User requested to launch a shared whiteboard for collaboration.');
      setCollaborations(prev => [...prev, {
        id: `collab-${Date.now()}`,
        activity: 'Launch Shared Whiteboard',
        details: 'User requested to launch a shared whiteboard for collaboration.',
        icon: <DashboardIcon />
      }]);
      setError(null);
    } catch (err) {
      console.error('Error launching whiteboard:', err);
      setError('Failed to request shared whiteboard launch from assistant.');
    }
  };

  const handleOpenForum = async () => {
    if (!conversationId) {
      setError('No active conversation to open discussion forum.');
      return;
    }
    try {
      await client.sendMessage(conversationId, 'User requested to open a discussion forum for collaboration.');
      setCollaborations(prev => [...prev, {
        id: `collab-${Date.now()}`,
        activity: 'Open Discussion Forum',
        details: 'User requested to open a discussion forum for collaboration.',
        icon: <ForumIcon />
      }]);
      setError(null);
    } catch (err) {
      console.error('Error opening forum:', err);
      setError('Failed to request discussion forum from assistant.');
    }
  };

  const handleShareResource = async () => {
    if (!conversationId) {
      setError('No active conversation to share resource.');
      return;
    }
    try {
      await client.sendMessage(conversationId, 'User requested to share an educational resource with collaborators.');
      setCollaborations(prev => [...prev, {
        id: `collab-${Date.now()}`,
        activity: 'Share Educational Resource',
        details: 'User requested to share an educational resource with collaborators.',
        icon: <ShareIcon />
      }]);
      setError(null);
    } catch (err) {
      console.error('Error sharing resource:', err);
      setError('Failed to request resource sharing from assistant.');
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ mt: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Collaborative Teaching Tools
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid size={{md: 4}}>
            <Button
              variant="contained"
              fullWidth
              startIcon={<DashboardIcon />}
              onClick={handleLaunchWhiteboard}
              sx={{ height: '100%' }}
            >
              Launch Shared Whiteboard
            </Button>
          </Grid>
          <Grid size={{md: 4}}>
            <Button
              variant="contained"
              fullWidth
              startIcon={<ForumIcon />}
              onClick={handleOpenForum}
              sx={{ height: '100%' }}
            >
              Open Discussion Forum
            </Button>
          </Grid>
          <Grid size={{md: 4}}>
            <Button
              variant="contained"
              fullWidth
              startIcon={<ShareIcon />}
              onClick={handleShareResource}
              sx={{ height: '100%' }}
            >
              Share Educational Resource
            </Button>
          </Grid>
        </Grid>

        <Typography variant="h6" gutterBottom sx={{ mt: 4 }}>
          Recent Collaborations
        </Typography>
        <List>
          {collaborations.length > 0 ? (
            collaborations.map((collab) => (
              <ListItem key={collab.id}>
                <ListItemIcon>{collab.icon}</ListItemIcon>
                <ListItemText primary={collab.activity} secondary={collab.details} />
              </ListItem>
            ))
          ) : (
            <ListItem>
              <ListItemText primary="No recent collaborations found." secondary="Collaborations will appear here once initiated." />
            </ListItem>
          )}
        </List>
      </Paper>
    </Box>
  );
};

export default CollaborativeTeachingTools;
