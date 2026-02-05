import React from 'react';
import { Box, Typography, Card, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip, LinearProgress } from '@mui/material';
import { Monitor as MonitorIcon } from '@mui/icons-material';
import { VendorStatus, AttendeeCheckInStats } from './types';
import { EventAssistantMessageBuilder } from '../../utils/AssistantMessageBuilders';

interface RealTimeEventMonitorProps {
  vendorStatus: VendorStatus[];
  attendeeStats: AttendeeCheckInStats;
  sendMessage: (message: string) => Promise<void>;
}

const RealTimeEventMonitor: React.FC<RealTimeEventMonitorProps> = ({ vendorStatus, attendeeStats, sendMessage }) => {

  return (
    <Card sx={{ p: 2, mb: 2 }}>
      <Typography variant="h6" gutterBottom>
        <MonitorIcon color="primary" sx={{ verticalAlign: 'middle', mr: 1 }} />
        Real-time Event Monitor
      </Typography>

      <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
        Vendor Status
      </Typography>

      <TableContainer component={Paper} sx={{ mb: 3 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Vendor</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Scheduled Arrival</TableCell>
              <TableCell>Actual Arrival</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {vendorStatus.map((vendor) => (
              <TableRow key={vendor.id}>
                <TableCell>{vendor.name}</TableCell>
                <TableCell>
                  <Chip
                    label={vendor.status}
                    color={vendor.status === 'On Schedule' ? 'success' : 'error'}
                    size="small"
                  />
                </TableCell>
                <TableCell>{vendor.arrivalTime}</TableCell>
                <TableCell>{vendor.actualTime}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Typography variant="subtitle2" gutterBottom>
        Attendee Check-in Status
      </Typography>

      <Box display="flex" justifyContent="space-around" sx={{ mb: 2 }}>
        <Box textAlign="center">
          <Typography variant="h5" fontWeight="bold">{attendeeStats.checkedIn}</Typography>
          <Typography variant="body2" color="text.secondary">Checked In</Typography>
        </Box>
        <Box textAlign="center">
          <Typography variant="h5" fontWeight="bold">{attendeeStats.remaining}</Typography>
          <Typography variant="body2" color="text.secondary">Remaining</Typography>
        </Box>
        <Box textAlign="center">
          <Typography variant="h5" fontWeight="bold">{attendeeStats.checkInRate}</Typography>
          <Typography variant="body2" color="text.secondary">Check-in Rate</Typography>
        </Box>
      </Box>

      <LinearProgress
        variant="determinate"
        value={(attendeeStats.checkedIn / attendeeStats.expected) * 100}
        sx={{ height: 10, borderRadius: 5, mb: 2 }}
        color="primary"
      />

      <Typography variant="body2" textAlign="center" sx={{ mb: 2 }}>
        {attendeeStats.checkedIn} / {attendeeStats.expected} attendees checked in
      </Typography>

      <Button
        variant="contained"
        color="primary"
        fullWidth
        onClick={() => {
          const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
          const msg = EventAssistantMessageBuilder.monitorEvent(missionId, 'client-id', 'conversation-id', 'event-status', { updateFrequency: 'realtime', flagIssues: true });
          sendMessage(JSON.stringify(msg));
        }}
      >
        Refresh Status
      </Button>
    </Card>
  );
};

export default RealTimeEventMonitor;

