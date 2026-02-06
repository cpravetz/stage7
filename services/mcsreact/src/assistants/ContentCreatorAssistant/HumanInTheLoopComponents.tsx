import React, { useEffect, useState } from 'react';
import { Box, Typography, Paper, Button, List, ListItem, ListItemText, ListItemSecondaryAction, Chip, CircularProgress } from '@mui/material';
import { ApprovalRequest } from './types'; // Import from shared types
import { ContentCreatorAssistantClient } from './ContentCreatorAssistantClient'; // Import the client

interface HumanInTheLoopComponentsProps {
  conversationId: string | null;
  client: ContentCreatorAssistantClient;
  setError: (message: string | null) => void;
}

const HumanInTheLoopComponents: React.FC<HumanInTheLoopComponentsProps> = ({ conversationId, client, setError }) => {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchApprovalRequests = async () => {
    if (!conversationId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await client.getApprovalRequests(conversationId);
      setRequests(data);
    } catch (err) {
      console.error('Error fetching approval requests:', err);
      setError(`Error fetching approval requests: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovalRequests();
  }, [conversationId, client]); // Re-fetch when conversationId or client changes

  const handleApprove = async (id: string) => {
    if (!conversationId) return;
    try {
      await client.updateApprovalRequestStatus(conversationId, id, 'approved');
      fetchApprovalRequests(); // Re-fetch to update the list
    } catch (err) {
      console.error('Error approving request:', err);
      setError(`Error approving request: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleReject = async (id: string) => {
    if (!conversationId) return;
    try {
      await client.updateApprovalRequestStatus(conversationId, id, 'rejected');
      fetchApprovalRequests(); // Re-fetch to update the list
    } catch (err) {
      console.error('Error rejecting request:', err);
      setError(`Error rejecting request: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const getStatusColor = (status: 'pending' | 'approved' | 'rejected') => {
    switch (status) {
      case 'pending': return 'info';
      case 'approved': return 'success';
      case 'rejected': return 'error';
      default: return 'default';
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ mt: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ ml: 2 }}>Loading Approval Requests...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Human-in-the-Loop Components
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        {requests.length > 0 ? (
          <List>
            {requests.map((request) => (
              <ListItem key={request.id} divider>
                <ListItemText
                  primary={request.type}
                  secondary={request.description}
                />
                <ListItemSecondaryAction>
                  {request.status === 'pending' ? (
                    <Box>
                      <Button
                        variant="outlined"
                        color="success"
                        size="small"
                        sx={{ mr: 1 }}
                        onClick={() => handleApprove(request.id)}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="outlined"
                        color="error"
                        size="small"
                        onClick={() => handleReject(request.id)}
                      >
                        Reject
                      </Button>
                    </Box>
                  ) : (
                    <Chip label={request.status} color={getStatusColor(request.status)} />
                  )}
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            No pending approval requests.
          </Typography>
        )}
      </Paper>
    </Box>
  );
};

export default HumanInTheLoopComponents;


