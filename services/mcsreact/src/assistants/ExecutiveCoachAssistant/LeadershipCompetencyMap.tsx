import React from 'react';
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, LinearProgress } from '@mui/material/index.js';

interface Competency {
  id: string;
  name: string;
  description: string;
  level: number; // 0-100 scale
  targetLevel: number;
}

const mockCompetencies: Competency[] = [
  { id: 'c1', name: 'Strategic Vision', description: 'Ability to define long-term direction.', level: 70, targetLevel: 90 },
  { id: 'c2', name: 'Change Management', description: 'Guiding teams through organizational changes.', level: 60, targetLevel: 80 },
  { id: 'c3', name: 'Talent Development', description: 'Nurturing and growing team members.', level: 85, targetLevel: 95 },
  { id: 'c4', name: 'Decision Making', description: 'Making timely and effective choices.', level: 75, targetLevel: 85 },
];

const LeadershipCompetencyMap = () => {
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Leadership Competency Map
      </Typography>
      <TableContainer component={Paper} elevation={2}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Competency</TableCell>
              <TableCell>Description</TableCell>
              <TableCell>Current Level</TableCell>
              <TableCell>Target Level</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {mockCompetencies.map((competency) => (
              <TableRow key={competency.id}>
                <TableCell>
                  <Typography variant="subtitle1">{competency.name}</Typography>
                </TableCell>
                <TableCell>{competency.description}</TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <LinearProgress
                      variant="determinate"
                      value={competency.level}
                      sx={{ flexGrow: 1, mr: 1 }}
                    />
                    <Typography variant="body2">{competency.level}%</Typography>
                  </Box>
                </TableCell>
                <TableCell>{competency.targetLevel}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default LeadershipCompetencyMap;


