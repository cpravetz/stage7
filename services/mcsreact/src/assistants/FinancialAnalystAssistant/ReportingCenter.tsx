import React from 'react';
import { Box, Typography, Paper, Button, List, ListItem, ListItemText, ListItemSecondaryAction } from '@mui/material/index.js';
import {PictureAsPdf as PictureAsPdfIcon} from '@mui/icons-material';
import {Email as EmailIcon} from '@mui/icons-material';

interface ReportOption {
  id: string;
  name: string;
  description: string;
}

const mockReportOptions: ReportOption[] = [
  { id: '1', name: 'Quarterly Earnings Report', description: 'Detailed report on company revenues, expenses, and profits.' },
  { id: '2', name: 'Investment Performance Summary', description: 'Overview of portfolio returns and asset allocation.' },
  { id: '3', name: 'Risk Assessment Report', description: 'Analysis of financial risks and mitigation strategies.' },
  { id: '4', name: 'Compliance Audit Report', description: 'Review of adherence to regulatory standards.' },
];

const ReportingCenter = () => {
  const handleGenerateReport = (reportId: string) => {
    console.log(`Generating financial report for: ${reportId}`);
    alert(`Financial report generated for ${reportId}! (Mock Action)`);
  };

  const handleDistributeReport = (reportId: string) => {
    console.log(`Distributing financial report for: ${reportId}`);
    alert(`Financial report for ${reportId} distributed! (Mock Action)`);
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


