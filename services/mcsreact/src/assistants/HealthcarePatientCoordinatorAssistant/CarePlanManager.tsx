import React, { useState } from 'react';
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, Button } from '@mui/material/index.js';
import { CarePlan, Patient } from './types';

interface CarePlanManagerProps {
  onCreateCarePlan?: (carePlan: CarePlan) => void;
  onUpdateCarePlan?: (planId: string, updates: Partial<CarePlan>) => void;
}

const mockCarePlans: CarePlan[] = [
  { id: 'cp1', patientId: 'p1', goal: 'Reduce headache severity', interventions: ['Medication', 'Rest', 'Follow-up with neurologist'], status: 'Active' },
  { id: 'cp2', patientId: 'p2', goal: 'Maintain overall health', interventions: ['Annual physical', 'Healthy diet', 'Exercise regularly'], status: 'Active' },
  { id: 'cp3', patientId: 'p3', goal: 'Stabilize cardiac function', interventions: ['Hospitalization', 'Cardiology consult', 'Medication adjustment'], status: 'Active' },
  { id: 'cp4', patientId: 'p4', goal: 'Monitor diabetes', interventions: ['Regular blood sugar checks', 'Dietary management', 'Endocrinologist consult'], status: 'Resolved' },
];

const mockPatients: Patient[] = [ // Need patient names for display
  { id: 'p1', name: 'John Doe', age: 45, gender: 'Male', reasonForVisit: 'Severe headache', status: 'Waiting', priority: 'Urgent' },
  { id: 'p2', name: 'Jane Smith', age: 28, gender: 'Female', reasonForVisit: 'Routine check-up', status: 'In Progress', priority: 'Routine' },
  { id: 'p3', name: 'Peter Jones', age: 62, gender: 'Male', reasonForVisit: 'Chest pain', status: 'Waiting', priority: 'Emergency' },
  { id: 'p4', name: 'Alice Brown', age: 35, gender: 'Female', reasonForVisit: 'Follow-up appointment', status: 'Completed', priority: 'Routine' },
];

const CarePlanManager: React.FC<CarePlanManagerProps> = ({ onCreateCarePlan, onUpdateCarePlan }) => {
  const getStatusColor = (status: CarePlan['status']) => {
    switch (status) {
      case 'Active': return 'info';
      case 'Resolved': return 'success';
      case 'Discontinued': return 'error';
      default: return 'default';
    }
  };

  const getPatientName = (patientId: string) => {
    return mockPatients.find(p => p.id === patientId)?.name || 'Unknown Patient';
  };

  const handleUpdateStatus = (carePlanId: string, newStatus: CarePlan['status']) => {
    onUpdateCarePlan?.(carePlanId, { status: newStatus });
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Care Plan Manager
      </Typography>
      <TableContainer component={Paper} elevation={2}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Patient Name</TableCell>
              <TableCell>Goal</TableCell>
              <TableCell>Interventions</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {mockCarePlans.map((plan) => (
              <TableRow key={plan.id}>
                <TableCell>{getPatientName(plan.patientId)}</TableCell>
                <TableCell>{plan.goal}</TableCell>
                <TableCell>{plan.interventions.join(', ')}</TableCell>
                <TableCell>
                  <Chip label={plan.status} color={getStatusColor(plan.status)} />
                </TableCell>
                <TableCell>
                  {plan.status === 'Active' && (
                    <Button variant="outlined" size="small" sx={{ mr: 1 }} onClick={() => handleUpdateStatus(plan.id, 'Resolved')}>Resolve</Button>
                  )}
                  <Button variant="outlined" color="error" size="small" onClick={() => handleUpdateStatus(plan.id, 'Discontinued')}>Discontinue</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default CarePlanManager;


