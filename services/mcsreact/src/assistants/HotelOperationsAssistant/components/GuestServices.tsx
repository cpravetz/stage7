import React from 'react';
import { Box, Typography, Button, List, ListItem, ListItemText, TextField, Paper } from '@mui/material';

interface GuestServicesProps {
  guestRequests: Array<{
    id: string;
    guestName: string;
    roomNumber: string;
    request: string;
    status: string;
    timestamp: string;
  }>;
  onCreateRequest: (request: any) => void;
  onResolveRequest: (requestId: string) => void;
  onSendMessage: (guestId: string, message: string) => void;
}

const GuestServices: React.FC<GuestServicesProps> = ({
  guestRequests,
  onCreateRequest,
  onResolveRequest,
  onSendMessage
}) => {
  const [newRequest, setNewRequest] = React.useState<{
    guestName: string;
    roomNumber: string;
    request: string;
  }>({
    guestName: '',
    roomNumber: '',
    request: ''
  });

  const handleSubmitRequest = () => {
    if (newRequest.guestName && newRequest.roomNumber && newRequest.request) {
      onCreateRequest({
        guestName: newRequest.guestName,
        roomNumber: newRequest.roomNumber,
        request: newRequest.request,
        timestamp: new Date().toISOString()
      });
      setNewRequest({ guestName: '', roomNumber: '', request: '' });
    }
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Guest Services Dashboard
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Create New Guest Request
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <TextField
            label="Guest Name"
            value={newRequest.guestName}
            onChange={(e) => setNewRequest({...newRequest, guestName: e.target.value})}
            sx={{ flex: 1 }}
          />
          <TextField
            label="Room Number"
            value={newRequest.roomNumber}
            onChange={(e) => setNewRequest({...newRequest, roomNumber: e.target.value})}
            sx={{ width: 150 }}
          />
        </Box>
        <TextField
          label="Request Details"
          value={newRequest.request}
          onChange={(e) => setNewRequest({...newRequest, request: e.target.value})}
          multiline
          rows={3}
          fullWidth
          sx={{ mb: 2 }}
        />
        <Button
          variant="contained"
          color="primary"
          onClick={handleSubmitRequest}
          disabled={!newRequest.guestName || !newRequest.roomNumber || !newRequest.request}
        >
          Submit Request
        </Button>
      </Paper>

      <Typography variant="subtitle1" gutterBottom>
        Active Guest Requests
      </Typography>

      <List>
        {guestRequests.map((request) => (
          <ListItem key={request.id} secondaryAction={
            request.status === 'Open' && (
              <Button
                variant="outlined"
                size="small"
                onClick={() => onResolveRequest(request.id)}
              >
                Mark Resolved
              </Button>
            )
          }>
            <ListItemText
              primary={`Room ${request.roomNumber} - ${request.guestName}`}
              secondary={
                <>
                  <Typography component="span" variant="body2" color="text.primary">
                    {request.request}
                  </Typography>
                  <br />
                  <Typography component="span" variant="caption" color="text.secondary">
                    {new Date(request.timestamp).toLocaleString()} • {request.status}
                  </Typography>
                </>
              }
            />
          </ListItem>
        ))}
      </List>

      <Box sx={{ mt: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Quick Actions
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Button variant="outlined" onClick={() => onSendMessage('all', 'Welcome to our hotel!')}>
            Send Welcome Message
          </Button>
          <Button variant="outlined" onClick={() => onSendMessage('all', 'Housekeeping will be arriving shortly')}>
            Notify Housekeeping
          </Button>
          <Button variant="outlined" onClick={() => onSendMessage('all', 'Your room service order is on the way')}>
            Room Service Update
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default GuestServices;

