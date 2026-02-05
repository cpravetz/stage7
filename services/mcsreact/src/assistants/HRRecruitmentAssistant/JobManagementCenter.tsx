import React from 'react';
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip } from '@mui/material/index.js';
import { JobPosting } from './types';

const mockJobPostings: JobPosting[] = [
  { id: 'jp1', title: 'Software Engineer (Senior)', department: 'Engineering', status: 'Open', applicants: 50, hired: 1 },
  { id: 'jp2', title: 'Product Manager', department: 'Product', status: 'On Hold', applicants: 30, hired: 0 },
  { id: 'jp3', title: 'UX Designer', department: 'Design', status: 'Closed', applicants: 20, hired: 1 },
  { id: 'jp4', title: 'Data Scientist', department: 'Analytics', status: 'Open', applicants: 60, hired: 0 },
];

const getStatusColor = (status: JobPosting['status']) => {
  switch (status) {
    case 'Open': return 'success';
    case 'On Hold': return 'warning';
    case 'Closed': return 'default';
    default: return 'default';
  }
};

const JobManagementCenter = () => {
  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Job Management Center
      </Typography>
      <TableContainer component={Paper} elevation={2}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Job Title</TableCell>
              <TableCell>Department</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Applicants</TableCell>
              <TableCell>Hired</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {mockJobPostings.map((job) => (
              <TableRow key={job.id}>
                <TableCell>{job.title}</TableCell>
                <TableCell>{job.department}</TableCell>
                <TableCell>
                  <Chip label={job.status} color={getStatusColor(job.status)} />
                </TableCell>
                <TableCell>{job.applicants}</TableCell>
                <TableCell>{job.hired}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default JobManagementCenter;


