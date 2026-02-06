import React from 'react';
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip } from '@mui/material/index.js';

interface ResourceCoordinationDashboardProps {
  onAllocateResource?: (resource: HealthcareResource) => void;
}

interface HealthcareResource {
  id: string;
  name: string;
  type: 'Specialist' | 'Clinic' | 'Pharmacy' | 'Therapist';
  specialty?: string;
  availability: 'Available' | 'Limited' | 'Unavailable';
}

const mockResources: HealthcareResource[] = [
  { id: 'res1', name: 'Dr. Emily White', type: 'Specialist', specialty: 'Neurologist', availability: 'Available' },
  { id: 'res2', name: 'City General Hospital', type: 'Clinic', availability: 'Limited' },
  { id: 'res3', name: 'Wellness Pharmacy', type: 'Pharmacy', availability: 'Available' },
  { id: 'res4', name: 'Dr. Alex Kim', type: 'Specialist', specialty: 'Cardiologist', availability: 'Unavailable' },
];

const ResourceCoordinationDashboard: React.FC<ResourceCoordinationDashboardProps> = ({ onAllocateResource }) => {
  const getAvailabilityColor = (availability: HealthcareResource['availability']) => {
    switch (availability) {
      case 'Available': return 'success';
      case 'Limited': return 'warning';
      case 'Unavailable': return 'error';
      default: return 'default';
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Resource Coordination Dashboard
      </Typography>
      <TableContainer component={Paper} elevation={2}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Specialty</TableCell>
              <TableCell>Availability</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {mockResources.map((resource) => (
              <TableRow key={resource.id}>
                <TableCell>{resource.name}</TableCell>
                <TableCell>{resource.type}</TableCell>
                <TableCell>{resource.specialty || 'N/A'}</TableCell>
                <TableCell>
                  <Chip label={resource.availability} color={getAvailabilityColor(resource.availability)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default ResourceCoordinationDashboard;


