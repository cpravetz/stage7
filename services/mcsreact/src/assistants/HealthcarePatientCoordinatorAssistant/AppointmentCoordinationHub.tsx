import React, { useState } from 'react';
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, Button, TextField, Grid, FormControl, InputLabel, Select, MenuItem } from '@mui/material/index.js';
import { Appointment, Patient } from './types';

const mockAppointments: Appointment[] = [
  { id: 'app1', patientId: 'p1', date: '2026-03-20', time: '10:00 AM', provider: 'Dr. Smith', type: 'Consultation', status: 'Scheduled' },
  { id: 'app2', patientId: 'p2', date: '2026-03-22', time: '02:00 PM', provider: 'Dr. Jones', type: 'Follow-up', status: 'Scheduled' },
  { id: 'app3', patientId: 'p3', date: '2026-03-18', time: '09:00 AM', provider: 'Dr. Lee', type: 'Emergency', status: 'Completed' },
];

const mockPatients: Patient[] = [ // Need patient names for display
  { id: 'p1', name: 'John Doe', age: 45, gender: 'Male', reasonForVisit: 'Severe headache', status: 'Waiting', priority: 'Urgent' },
  { id: 'p2', name: 'Jane Smith', age: 28, gender: 'Female', reasonForVisit: 'Routine check-up', status: 'In Progress', priority: 'Routine' },
  { id: 'p3', name: 'Peter Jones', age: 62, gender: 'Male', reasonForVisit: 'Chest pain', status: 'Waiting', priority: 'Emergency' },
];

interface AppointmentCoordinationHubProps {
  onScheduleAppointment?: (appointment: Omit<Appointment, 'id' | 'status'>) => void;
  onRescheduleAppointment?: (appointmentId: string, newDate: string) => void;
  onCancelAppointment?: (appointmentId: string) => void;
}

const AppointmentCoordinationHub: React.FC<AppointmentCoordinationHubProps> = ({
  onScheduleAppointment,
  onRescheduleAppointment,
  onCancelAppointment
}) => {
  const [appointments, setAppointments] = useState<Appointment[]>(mockAppointments);
  const [newAppointment, setNewAppointment] = useState<Omit<Appointment, 'id' | 'status'>>({ patientId: '', date: '', time: '', provider: '', type: '' });

  const getStatusColor = (status: Appointment['status']) => {
    switch (status) {
      case 'Scheduled': return 'info';
      case 'Completed': return 'success';
      case 'Cancelled': return 'error';
      default: return 'default';
    }
  };

  const getPatientName = (patientId: string) => {
    return mockPatients.find(p => p.id === patientId)?.name || 'Unknown Patient';
  };

  const handleScheduleAppointment = () => {
    if (newAppointment.patientId && newAppointment.date && newAppointment.time) {
      setAppointments([...appointments, { ...newAppointment, id: String(appointments.length + 1), status: 'Scheduled' }]);
      onScheduleAppointment?.(newAppointment);
      setNewAppointment({ patientId: '', date: '', time: '', provider: '', type: '' });
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Appointment Coordination Hub
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Schedule New Appointment
            </Typography>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel id="patient-select-label">Patient</InputLabel>
              <Select
                labelId="patient-select-label"
                value={newAppointment.patientId}
                label="Patient"
                onChange={(e) => setNewAppointment({ ...newAppointment, patientId: e.target.value as string })}
              >
                {mockPatients.map((patient) => (
                  <MenuItem key={patient.id} value={patient.id}>
                    {patient.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Date (YYYY-MM-DD)"
              fullWidth
              value={newAppointment.date}
              onChange={(e) => setNewAppointment({ ...newAppointment, date: e.target.value })}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Time (HH:MM AM/PM)"
              fullWidth
              value={newAppointment.time}
              onChange={(e) => setNewAppointment({ ...newAppointment, time: e.target.value })}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Provider"
              fullWidth
              value={newAppointment.provider}
              onChange={(e) => setNewAppointment({ ...newAppointment, provider: e.target.value })}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Type"
              fullWidth
              value={newAppointment.type}
              onChange={(e) => setNewAppointment({ ...newAppointment, type: e.target.value })}
              sx={{ mb: 2 }}
            />
            <Button variant="contained" onClick={handleScheduleAppointment} fullWidth>
              Schedule Appointment
            </Button>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Upcoming Appointments
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Patient</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Time</TableCell>
                    <TableCell>Provider</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {appointments.filter(app => app.status === 'Scheduled').map((app) => (
                    <TableRow key={app.id}>
                      <TableCell>{getPatientName(app.patientId)}</TableCell>
                      <TableCell>{app.date}</TableCell>
                      <TableCell>{app.time}</TableCell>
                      <TableCell>{app.provider}</TableCell>
                      <TableCell><Chip label={app.status} color={getStatusColor(app.status)} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default AppointmentCoordinationHub;


