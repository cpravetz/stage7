import React from 'react';
import { Box, Typography, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, TextField } from '@mui/material';

interface MaintenanceProps {
  maintenanceRequests: Array<{
    id: string;
    roomNumber: string;
    issueDescription: string;
    priority: string;
    status: string;
    assignedTo: string;
    reportedDate: string;
  }>;
  onCreateRequest: (request: any) => void;
  onUpdateStatus: (requestId: string, status: string) => void;
}

const Maintenance: React.FC<MaintenanceProps> = ({
  maintenanceRequests,
  onCreateRequest,
  onUpdateStatus
}) => {
  const [newRequest, setNewRequest] = React.useState<{
    roomNumber: string;
    issueDescription: string;
    priority: string;
  }>({
    roomNumber: '',
    issueDescription: '',
    priority: 'Medium'
  });

  const handleCreate = () => {
    if (newRequest.roomNumber && newRequest.issueDescription) {
      onCreateRequest({
        roomNumber: newRequest.roomNumber,
        issueDescription: newRequest.issueDescription,
        priority: newRequest.priority,
        reportedDate: new Date().toISOString()
      });
      setNewRequest({ roomNumber: '', issueDescription: '', priority: 'Medium' });
    }
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Maintenance Management
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Report New Maintenance Issue
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
          <TextField
            label="Room Number"
            value={newRequest.roomNumber}
            onChange={(e) => setNewRequest({...newRequest, roomNumber: e.target.value})}
            sx={{ width: 150 }}
          />
          <TextField
            select
            label="Priority"
            value={newRequest.priority}
            onChange={(e) => setNewRequest({...newRequest, priority: e.target.value})}
            SelectProps={{ native: true }}
            sx={{ width: 150 }}
          >
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Urgent">Urgent</option>
          </TextField>
        </Box>
        <TextField
          label="Issue Description"
          value={newRequest.issueDescription}
          onChange={(e) => setNewRequest({...newRequest, issueDescription: e.target.value})}
          multiline
          rows={3}
          fullWidth
          sx={{ mb: 2 }}
        />
        <Button
          variant="contained"
          color="primary"
          onClick={handleCreate}
          disabled={!newRequest.roomNumber || !newRequest.issueDescription}
        >
          Report Issue
        </Button>
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Request ID</TableCell>
              <TableCell>Room</TableCell>
              <TableCell>Issue</TableCell>
              <TableCell>Priority</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Assigned To</TableCell>
              <TableCell>Reported</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {maintenanceRequests.map((request) => (
              <TableRow key={request.id}>
                <TableCell>{request.id}</TableCell>
                <TableCell>{request.roomNumber}</TableCell>
                <TableCell>{request.issueDescription}</TableCell>
                <TableCell>{request.priority}</TableCell>
                <TableCell>{request.status}</TableCell>
                <TableCell>{request.assignedTo}</TableCell>
                <TableCell>{new Date(request.reportedDate).toLocaleDateString()}</TableCell>
                <TableCell>
                  {request.status === 'Reported' && (
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => onUpdateStatus(request.id, 'In Progress')}
                    >
                      Assign
                    </Button>
                  )}
                  {request.status === 'In Progress' && (
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => onUpdateStatus(request.id, 'Completed')}
                    >
                      Complete
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ mt: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Maintenance Summary
        </Typography>
        <Paper sx={{ p: 2 }}>
          <Typography>Open Requests: {maintenanceRequests.filter(r => r.status === 'Reported').length}</Typography>
          <Typography>In Progress: {maintenanceRequests.filter(r => r.status === 'In Progress').length}</Typography>
          <Typography>Completed: {maintenanceRequests.filter(r => r.status === 'Completed').length}</Typography>
          <Typography>Urgent Issues: {maintenanceRequests.filter(r => r.priority === 'Urgent' && r.status !== 'Completed').length}</Typography>
        </Paper>
      </Box>
    </Box>
  );
};

export default Maintenance;

