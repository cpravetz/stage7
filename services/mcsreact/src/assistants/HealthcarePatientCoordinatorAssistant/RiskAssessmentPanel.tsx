import React from 'react';
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip } from '@mui/material/index.js';

interface RiskAssessmentPanelProps {
  onAssessRisk?: (riskData: RiskAssessment) => void;
}

interface RiskAssessment {
  id: string;
  patientId: string;
  riskType: 'Cardiovascular' | 'Diabetes' | 'Falls' | 'Mental Health';
  score: number; // e.g., 1-10 scale
  severity: 'Low' | 'Moderate' | 'High';
  recommendations: string[];
}

const mockRiskAssessments: RiskAssessment[] = [
  { id: 'ra1', patientId: 'p1', riskType: 'Cardiovascular', score: 7, severity: 'Moderate', recommendations: ['Monitor blood pressure', 'Encourage exercise'] },
  { id: 'ra2', patientId: 'p2', riskType: 'Diabetes', score: 3, severity: 'Low', recommendations: ['Maintain healthy diet'] },
  { id: 'ra3', patientId: 'p3', riskType: 'Falls', score: 9, severity: 'High', recommendations: ['Physical therapy consult', 'Home safety assessment'] },
];

const RiskAssessmentPanel: React.FC<RiskAssessmentPanelProps> = ({ onAssessRisk }) => {
  const getSeverityColor = (severity: RiskAssessment['severity']) => {
    switch (severity) {
      case 'Low': return 'success';
      case 'Moderate': return 'warning';
      case 'High': return 'error';
      default: return 'default';
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Risk Assessment Panel
      </Typography>
      <TableContainer component={Paper} elevation={2}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Patient ID</TableCell>
              <TableCell>Risk Type</TableCell>
              <TableCell>Score</TableCell>
              <TableCell>Severity</TableCell>
              <TableCell>Recommendations</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {mockRiskAssessments.map((assessment) => (
              <TableRow key={assessment.id}>
                <TableCell>{assessment.patientId}</TableCell>
                <TableCell>{assessment.riskType}</TableCell>
                <TableCell>{assessment.score}</TableCell>
                <TableCell>
                  <Chip label={assessment.severity} color={getSeverityColor(assessment.severity)} />
                </TableCell>
                <TableCell>{assessment.recommendations.join(', ')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default RiskAssessmentPanel;


