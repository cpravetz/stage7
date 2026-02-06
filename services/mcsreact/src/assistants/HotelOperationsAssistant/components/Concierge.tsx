import React from 'react';
import { Box, Typography, Button, List, ListItem, ListItemText, TextField, Paper, Chip } from '@mui/material';

interface ConciergeProps {
  conciergeRequests: Array<{
    id: string;
    guestName: string;
    roomNumber: string;
    requestType: string;
    requestDetails: string;
    status: string;
    notes: string;
  }>;
  onAddRequest: (request: any) => void;
  onFulfillRequest: (requestId: string) => void;
}

const Concierge: React.FC<ConciergeProps> = ({
  conciergeRequests,
  onAddRequest,
  onFulfillRequest
}) => {
  const [newRequest, setNewRequest] = React.useState<{
    guestName: string;
    roomNumber: string;
    requestType: string;
    requestDetails: string;
  }>({
    guestName: '',
    roomNumber: '',
    requestType: 'Restaurant Reservation',
    requestDetails: ''
  });

  const handleAdd = () => {
    if (newRequest.guestName && newRequest.roomNumber && newRequest.requestDetails) {
      onAddRequest({
        guestName: newRequest.guestName,
        roomNumber: newRequest.roomNumber,
        requestType: newRequest.requestType,
        requestDetails: newRequest.requestDetails
      });
      setNewRequest({ guestName: '', roomNumber: '', requestType: 'Restaurant Reservation', requestDetails: '' });
    }
  };

  const requestTypes = [
    'Restaurant Reservation',
    'Transportation',
    'Local Information',
    'Ticket Booking',
    'Special Request',
    'Wake-up Call',
    'Luggage Assistance'
  ];

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Concierge Services
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Add New Concierge Request
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
          <TextField
            label="Guest Name"
            value={newRequest.guestName}
            onChange={(e) => setNewRequest({...newRequest, guestName: e.target.value})}
            sx={{ flex: 1, minWidth: 200 }}
          />
          <TextField
            label="Room Number"
            value={newRequest.roomNumber}
            onChange={(e) => setNewRequest({...newRequest, roomNumber: e.target.value})}
            sx={{ width: 150 }}
          />
          <TextField
            select
            label="Request Type"
            value={newRequest.requestType}
            onChange={(e) => setNewRequest({...newRequest, requestType: e.target.value})}
            SelectProps={{ native: true }}
            sx={{ width: 200 }}
          >
            {requestTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </TextField>
        </Box>
        <TextField
          label="Request Details"
          value={newRequest.requestDetails}
          onChange={(e) => setNewRequest({...newRequest, requestDetails: e.target.value})}
          multiline
          rows={3}
          fullWidth
          sx={{ mb: 2 }}
        />
        <Button
          variant="contained"
          color="primary"
          onClick={handleAdd}
          disabled={!newRequest.guestName || !newRequest.roomNumber || !newRequest.requestDetails}
        >
          Add Request
        </Button>
      </Paper>

      <Typography variant="subtitle1" gutterBottom>
        Active Concierge Requests
      </Typography>

      <List>
        {conciergeRequests.map((request) => (
          <ListItem key={request.id} secondaryAction={
            request.status === 'Open' && (
              <Button
                variant="outlined"
                size="small"
                onClick={() => onFulfillRequest(request.id)}
              >
                Mark Fulfilled
              </Button>
            )
          }>
            <ListItemText
              primary={
                <>
                  <Chip label={request.requestType} size="small" sx={{ mr: 1 }} />
                  {request.guestName} (Room {request.roomNumber})
                </>
              }
              secondary={
                <>
                  <Typography component="span" variant="body2" color="text.primary">
                    {request.requestDetails}
                  </Typography>
                  {request.notes && (
                    <>
                      <br />
                      <Typography component="span" variant="caption" color="text.secondary">
                        Notes: {request.notes}
                      </Typography>
                    </>
                  )}
                  <br />
                  <Typography component="span" variant="caption" color="text.secondary">
                    Status: {request.status}
                  </Typography>
                </>
              }
            />
          </ListItem>
        ))}
      </List>

      <Box sx={{ mt: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Quick Concierge Actions
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {requestTypes.map((type) => (
            <Button
              key={type}
              variant="outlined"
              onClick={() => setNewRequest({...newRequest, requestType: type})}
            >
              {type}
            </Button>
          ))}
        </Box>
      </Box>
    </Box>
  );
};

export default Concierge;

