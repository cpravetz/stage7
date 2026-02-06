import React from 'react';
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, Button, Card } from '@mui/material/index.js';
import { People as PeopleIcon, Add as AddIcon } from '@mui/icons-material';
import { EventAssistantMessageBuilder } from '../../utils/AssistantMessageBuilders';

interface Attendee {
  id: string;
  name: string;
  email: string;
  status: 'Registered' | 'Checked In' | 'Cancelled' | string; // Added string for flexibility
  dietaryRestrictions: string;
  checkedIn: boolean; // Add checkedIn property for clearer status management
}

interface AttendeeStats {
  totalInvited: number;
  confirmed: number;
  pending: number;
  declined: number;
  checkedIn: number;
}

interface AttendeeManagementPanelProps {
  attendees: Attendee[];
  stats: AttendeeStats;
  sendMessage: (message: string) => Promise<void>;
}

const AttendeeManagementPanel: React.FC<AttendeeManagementPanelProps> = ({ attendees, stats, sendMessage }) => {
  const getStatusColor = (status: Attendee['status']) => {
    switch (status) {
      case 'Registered': return 'info';
      case 'Checked In': return 'success';
      case 'Cancelled': return 'error';
      default: return 'default';
    }
  };

  return (
    <Card sx={{ p: 2, mb: 2 }}>
      <Typography variant="h6" gutterBottom>
        <PeopleIcon color="primary" sx={{ verticalAlign: 'middle', mr: 1 }} />
        Attendee Management Panel
      </Typography>

      <Box display="flex" justifyContent="space-around" sx={{ mb: 3 }}>
        <Box textAlign="center">
          <Typography variant="h5" fontWeight="bold">{stats.totalInvited}</Typography>
          <Typography variant="body2" color="text.secondary">Total Invited</Typography>
        </Box>
        <Box textAlign="center">
          <Typography variant="h5" fontWeight="bold" color="success.main">{stats.confirmed}</Typography>
          <Typography variant="body2" color="text.secondary">Confirmed</Typography>
        </Box>
        <Box textAlign="center">
          <Typography variant="h5" fontWeight="bold" color="warning.main">{stats.pending}</Typography>
          <Typography variant="body2" color="text.secondary">Pending</Typography>
        </Box>
        <Box textAlign="center">
          <Typography variant="h5" fontWeight="bold" color="error.main">{stats.declined}</Typography>
          <Typography variant="body2" color="text.secondary">Declined</Typography>
        </Box>
        <Box textAlign="center">
          <Typography variant="h5" fontWeight="bold" color="info.main">{stats.checkedIn}</Typography>
          <Typography variant="body2" color="text.secondary">Checked In</Typography>
        </Box>
      </Box>

      <TableContainer component={Paper} sx={{ mt: 2 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Dietary</TableCell>
              <TableCell>Checked In</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {attendees.length > 0 ? (
              attendees.map((attendee) => (
                <TableRow key={attendee.id}>
                  <TableCell>{attendee.name}</TableCell>
                  <TableCell>{attendee.email}</TableCell>
                  <TableCell>
                    <Chip label={attendee.status} color={getStatusColor(attendee.status)} />
                  </TableCell>
                  <TableCell>{attendee.dietaryRestrictions || 'None'}</TableCell>
                  <TableCell>
                    <Chip label={attendee.checkedIn ? 'Yes' : 'No'} color={attendee.checkedIn ? 'success' : 'default'} size="small" />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  No attendees found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Box display="flex" gap={2} sx={{ mt: 2 }}>
        <Button variant="contained" color="primary" startIcon={<AddIcon />}
          onClick={() => {
            const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
            const msg = EventAssistantMessageBuilder.scheduleEventCommunication(missionId, 'client-id', 'conversation-id', { optimizationGoal: 'engagement' });
            sendMessage(JSON.stringify(msg));
          }}>
          Import Guest List
        </Button>
        <Button variant="outlined" startIcon={<AddIcon />}
          onClick={() => {
            const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
            const msg = EventAssistantMessageBuilder.scheduleEventCommunication(missionId, 'client-id', 'conversation-id', { scheduleMessages: true });
            sendMessage(JSON.stringify(msg));
          }}>
          Send Invitations
        </Button>
      </Box>
    </Card>
  );
};

export default AttendeeManagementPanel;


