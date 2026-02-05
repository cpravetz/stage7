import React, { useState } from 'react';
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, Button, TextField, Grid, FormControl, InputLabel, Select, MenuItem } from '@mui/material/index.js';
import { Candidate } from './types';

interface Interview {
  id: string;
  candidateId: string;
  interviewer: string;
  date: string;
  time: string;
  type: 'Initial Screen' | 'Technical' | 'Behavioral' | 'Hiring Manager';
  status: 'Scheduled' | 'Completed' | 'Cancelled';
}

const mockCandidates: Candidate[] = [ // Need candidate names for display
  { id: 'c1', name: 'Alice Wonderland', email: 'alice@example.com', stage: 'Interviewing', score: 85 },
  { id: 'c2', name: 'Bob The Builder', email: 'bob@example.com', stage: 'Applied', score: 70 },
  { id: 'c3', name: 'Charlie Chaplin', email: 'charlie@example.com', stage: 'Offer Extended', score: 92 },
];

const mockInterviews: Interview[] = [
  { id: 'i1', candidateId: 'c1', interviewer: 'John Doe', date: '2026-03-20', time: '10:00 AM', type: 'Technical', status: 'Scheduled' },
  { id: 'i2', candidateId: 'c1', interviewer: 'Jane Smith', date: '2026-03-22', time: '02:00 PM', type: 'Behavioral', status: 'Scheduled' },
  { id: 'i3', candidateId: 'c3', interviewer: 'Peter Jones', date: '2026-03-18', time: '09:00 AM', type: 'Hiring Manager', status: 'Completed' },
];

const InterviewSchedulingInterface = () => {
  const [interviews, setInterviews] = useState<Interview[]>(mockInterviews);
  const [newInterview, setNewInterview] = useState<Omit<Interview, 'id' | 'status'>>({ candidateId: '', interviewer: '', date: '', time: '', type: 'Initial Screen' });

  const getStatusColor = (status: Interview['status']) => {
    switch (status) {
      case 'Scheduled': return 'info';
      case 'Completed': return 'success';
      case 'Cancelled': return 'error';
      default: return 'default';
    }
  };

  const getCandidateName = (candidateId: string) => {
    return mockCandidates.find(c => c.id === candidateId)?.name || 'Unknown Candidate';
  };

  const handleScheduleInterview = () => {
    if (newInterview.candidateId && newInterview.date && newInterview.time && newInterview.interviewer) {
      setInterviews([...interviews, { ...newInterview, id: String(interviews.length + 1), status: 'Scheduled' }]);
      setNewInterview({ candidateId: '', interviewer: '', date: '', time: '', type: 'Initial Screen' });
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Interview Scheduling Interface
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Schedule New Interview
            </Typography>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel id="candidate-select-label">Candidate</InputLabel>
              <Select
                labelId="candidate-select-label"
                value={newInterview.candidateId}
                label="Candidate"
                onChange={(e) => setNewInterview({ ...newInterview, candidateId: e.target.value as string })}
              >
                {mockCandidates.map((candidate) => (
                  <MenuItem key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Interviewer"
              fullWidth
              value={newInterview.interviewer}
              onChange={(e) => setNewInterview({ ...newInterview, interviewer: e.target.value })}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Date (YYYY-MM-DD)"
              fullWidth
              value={newInterview.date}
              onChange={(e) => setNewInterview({ ...newInterview, date: e.target.value })}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Time (HH:MM AM/PM)"
              fullWidth
              value={newInterview.time}
              onChange={(e) => setNewInterview({ ...newInterview, time: e.target.value })}
              sx={{ mb: 2 }}
            />
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel id="type-select-label">Interview Type</InputLabel>
              <Select
                labelId="type-select-label"
                value={newInterview.type}
                label="Interview Type"
                onChange={(e) => setNewInterview({ ...newInterview, type: e.target.value as Interview['type'] })}
              >
                <MenuItem value="Initial Screen">Initial Screen</MenuItem>
                <MenuItem value="Technical">Technical</MenuItem>
                <MenuItem value="Behavioral">Behavioral</MenuItem>
                <MenuItem value="Hiring Manager">Hiring Manager</MenuItem>
              </Select>
            </FormControl>
            <Button variant="contained" onClick={handleScheduleInterview} fullWidth>
              Schedule Interview
            </Button>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Upcoming Interviews
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Candidate</TableCell>
                    <TableCell>Interviewer</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Time</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {interviews.filter(i => i.status === 'Scheduled').map((interview) => (
                    <TableRow key={interview.id}>
                      <TableCell>{getCandidateName(interview.candidateId)}</TableCell>
                      <TableCell>{interview.interviewer}</TableCell>
                      <TableCell>{interview.date}</TableCell>
                      <TableCell>{interview.time}</TableCell>
                      <TableCell>{interview.type}</TableCell>
                      <TableCell><Chip label={interview.status} color={getStatusColor(interview.status)} /></TableCell>
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

export default InterviewSchedulingInterface;


