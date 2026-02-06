import React from 'react';
import { Box, Typography, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, TextField } from '@mui/material/index.js';

interface StaffMember {
  id: string;
  name: string;
  role: string;
  availability: string;
}

interface Shift {
  id: string;
  staffId: string;
  date: string;
  startTime: string;
  endTime: string;
  role: string;
}

interface StaffSchedulingProps {
  staff: StaffMember[];
  shifts: Shift[];
  sendMessage: (message: string) => Promise<void>;
  onScheduleStaff?: (staffId: string, shift: Shift) => Promise<void>;
  onUpdateAvailability?: (staffId: string, available: boolean) => Promise<void>;
}

const StaffScheduling: React.FC<StaffSchedulingProps> = ({
  staff,
  shifts,
  sendMessage
}) => {
  const [newShift, setNewShift] = React.useState<{
    staffId: string;
    date: string;
    startTime: string;
    endTime: string;
  }>({
    staffId: '',
    date: '',
    startTime: '',
    endTime: ''
  });

  const handleSchedule = () => {
    if (newShift.staffId && newShift.date && newShift.startTime && newShift.endTime) {
      sendMessage(`Schedule staff ${newShift.staffId} for shift on ${newShift.date} from ${newShift.startTime} to ${newShift.endTime}`);
      setNewShift({ staffId: '', date: '', startTime: '', endTime: '' });
    }
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Staff Scheduling
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Create New Shift
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
          <TextField
            select
            label="Select Staff"
            value={newShift.staffId}
            onChange={(e) => setNewShift({...newShift, staffId: e.target.value})}
            SelectProps={{ native: true }}
            sx={{ minWidth: 200 }}
          >
            <option value="">Select staff member</option>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>{member.name} ({member.role})</option>
            ))}
          </TextField>
          <TextField
            label="Date"
            type="date"
            value={newShift.date}
            onChange={(e) => setNewShift({...newShift, date: e.target.value})}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Start Time"
            type="time"
            value={newShift.startTime}
            onChange={(e) => setNewShift({...newShift, startTime: e.target.value})}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="End Time"
            type="time"
            value={newShift.endTime}
            onChange={(e) => setNewShift({...newShift, endTime: e.target.value})}
            InputLabelProps={{ shrink: true }}
          />
          <Button
            variant="contained"
            color="primary"
            onClick={handleSchedule}
            disabled={!newShift.staffId || !newShift.date || !newShift.startTime || !newShift.endTime}
          >
            Schedule Shift
          </Button>
        </Box>
      </Paper>

      <Typography variant="subtitle1" gutterBottom>
        Staff Availability
      </Typography>

      <TableContainer component={Paper} sx={{ mb: 3 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Availability</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {staff.map((member) => (
              <TableRow key={member.id}>
                <TableCell>{member.name}</TableCell>
                <TableCell>{member.role}</TableCell>
                <TableCell>{member.availability}</TableCell>
                <TableCell>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => sendMessage(`Update availability for ${member.name} (ID: ${member.id}) to ${member.availability === 'Available' ? 'Unavailable' : 'Available'}`)}
                  >
                    {member.availability === 'Available' ? 'Mark Unavailable' : 'Mark Available'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Typography variant="subtitle1" gutterBottom>
        Upcoming Shifts
      </Typography>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Staff</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Shift Time</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {shifts.map((shift) => {
              const staffMember = staff.find(s => s.id === shift.staffId);
              return (
                <TableRow key={shift.id}>
                  <TableCell>{staffMember?.name || shift.staffId}</TableCell>
                  <TableCell>{shift.role}</TableCell>
                  <TableCell>{new Date(shift.date).toLocaleDateString()}</TableCell>
                  <TableCell>{shift.startTime} - {shift.endTime}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ mt: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Button variant="outlined" onClick={() => sendMessage(`Mark all staff as Available`)}>
          Mark All Available
        </Button>
        <Button variant="outlined" onClick={() => sendMessage(`Auto-schedule all staff`)}>
          Auto-Schedule
        </Button>
      </Box>
    </Box>
  );
};

export default StaffScheduling;

