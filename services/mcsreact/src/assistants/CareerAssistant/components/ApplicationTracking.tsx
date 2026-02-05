import React from 'react';
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, Button } from '@mui/material/index.js';
import { Application } from '../types';

interface ApplicationTrackingProps {
  applications: Application[];
  onUpdateStatus: (appId: string, newStatus: Application['status']) => void;
  onAddApplication: () => void;
}

const ApplicationTracking: React.FC<ApplicationTrackingProps> = ({
  applications,
  onUpdateStatus,
  onAddApplication,
}) => {
  const getStatusColor = (status: Application['status']) => {
    switch (status) {
      case 'Applied': return 'primary';
      case 'Interviewing': return 'info';
      case 'Offer': return 'success';
      case 'Rejected': return 'error';
      default: return 'default';
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Application Tracking and Management
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
          <Button variant="contained" onClick={onAddApplication}>
            Add New Application
          </Button>
        </Box>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Job ID</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Date Applied</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {applications.length > 0 ? (
                applications.map((app) => (
                  <TableRow key={app.id}>
                    <TableCell>{app.jobId}</TableCell>
                    <TableCell>
                      <Chip label={app.status} color={getStatusColor(app.status)} />
                    </TableCell>
                    <TableCell>{app.dateApplied}</TableCell>
                    <TableCell>
                      <Button
                        variant="outlined"
                        size="small"
                        sx={{ mr: 1 }}
                        onClick={() => onUpdateStatus(app.id, 'Interviewing')}
                        disabled={app.status === 'Interviewing' || app.status === 'Offer' || app.status === 'Rejected'}
                      >
                        Mark Interviewing
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        color="success"
                        sx={{ mr: 1 }}
                        onClick={() => onUpdateStatus(app.id, 'Offer')}
                        disabled={app.status === 'Offer' || app.status === 'Rejected'}
                      >
                        Mark Offer
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        color="error"
                        onClick={() => onUpdateStatus(app.id, 'Rejected')}
                        disabled={app.status === 'Rejected'}
                      >
                        Mark Rejected
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} align="center">
                    No applications tracked yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};

export default ApplicationTracking;


