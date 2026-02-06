import React from 'react';
import { Box, Typography, Paper, Button, List, ListItem, ListItemText, ListItemSecondaryAction } from '@mui/material/index.js';
import {PictureAsPdf as PictureAsPdfIcon, Email as EmailIcon} from '@mui/icons-material';

interface ReportOption {
  id: string;
  name: string;
  description: string;
}

const mockReportOptions: ReportOption[] = [
  { id: '1', name: 'Diversity & Inclusion Report', description: 'Analysis of D&I metrics across recruitment stages.' },
  { id: '2', name: 'Time-to-Hire Report', description: 'Metrics on the efficiency of the hiring process.' },
  { id: '3', name: 'Candidate Source Effectiveness', description: 'Report on which sourcing channels yield the best candidates.' },
  { id: '4', name: 'Recruitment Cost Analysis', description: 'Breakdown of costs associated with hiring new talent.' },
];

const ReportingCenter = () => {
  const handleGenerateReport = (reportId: string) => {
    console.log(`Generating HR report for: ${reportId}`);
    alert(`HR report generated for ${reportId}! (Mock Action)`);
  };

  const handleDistributeReport = (reportId: string) => {
    console.log(`Distributing HR report for: ${reportId}`);
    alert(`HR report for ${reportId} distributed! (Mock Action)`);
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Reporting Center
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <List>
          {mockReportOptions.map((report) => (
            <ListItem key={report.id} divider>
              <ListItemText
                primary={report.name}
                secondary={report.description}
              />
              <ListItemSecondaryAction>
                <Button
                  variant="outlined"
                  color="primary"
                  size="small"
                  sx={{ mr: 1 }}
                  startIcon={<PictureAsPdfIcon />}
                  onClick={() => handleGenerateReport(report.id)}
                >
                  Generate PDF
                </Button>
                <Button
                  variant="outlined"
                  color="secondary"
                  size="small"
                  startIcon={<EmailIcon />}
                  onClick={() => handleDistributeReport(report.id)}
                >
                  Distribute
                </Button>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      </Paper>
    </Box>
  );
};

export default ReportingCenter;


