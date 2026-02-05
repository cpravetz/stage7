import React from 'react';
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip } from '@mui/material/index.js';
import { Patient } from './types';

interface PatientTriageCenterProps {
  onTriagePatient?: (triageData: { patientId: string; priority: string }) => void;
}

const mockPatients: Patient[] = [
  { id: 'p1', name: 'John Doe', age: 45, gender: 'Male', reasonForVisit: 'Severe headache', status: 'Waiting', priority: 'Urgent' },
  { id: 'p2', name: 'Jane Smith', age: 28, gender: 'Female', reasonForVisit: 'Routine check-up', status: 'In Progress', priority: 'Routine' },
  { id: 'p3', name: 'Peter Jones', age: 62, gender: 'Male', reasonForVisit: 'Chest pain', status: 'Waiting', priority: 'Emergency' },
  { id: 'p4', name: 'Alice Brown', age: 35, gender: 'Female', reasonForVisit: 'Follow-up appointment', status: 'Completed', priority: 'Routine' },
];

const getStatusColor = (status: Patient['status']) => {
  switch (status) {
    case 'Waiting': return 'warning';
    case 'In Progress': return 'info';
    case 'Completed': return 'success';
    default: return 'default';
  }
};

const getPriorityColor = (priority: Patient['priority']) => {
  switch (priority) {
    case 'Routine': return 'default';
    case 'Urgent': return 'warning';
    case 'Emergency': return 'error';
    default: return 'default';
  }
};

const PatientTriageCenter: React.FC<PatientTriageCenterProps> = ({ onTriagePatient }) => {
  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Patient Triage Center
      </Typography>
      <TableContainer component={Paper} elevation={2}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Age</TableCell>
              <TableCell>Reason for Visit</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Priority</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {mockPatients.map((patient) => (
              <TableRow key={patient.id}>
                <TableCell>{patient.name}</TableCell>
                <TableCell>{patient.age}</TableCell>
                <TableCell>{patient.reasonForVisit}</TableCell>
                <TableCell>
                  <Chip label={patient.status} color={getStatusColor(patient.status)} />
                </TableCell>
                <TableCell>
                  <Chip label={patient.priority} color={getPriorityColor(patient.priority)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default PatientTriageCenter;


