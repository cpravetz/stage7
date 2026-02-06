import React from 'react';
import { Box, Typography, Paper, Button, List, ListItem, ListItemText, ListItemSecondaryAction, TextField } from '@mui/material/index.js';
import {PictureAsPdf as PictureAsPdfIcon, Email as EmailIcon, Add as AddIcon} from '@mui/icons-material';

interface ReportingCenterProps {
  reports: any[];
  onGenerateReport: (reportType: string) => void;
  sendMessage: (message: string) => void;
}

const reportOptions = [
  { id: '1', name: 'Quarterly Sales Report', description: 'Comprehensive report on sales performance for the quarter.' },
  { id: '2', name: 'Pipeline Health Report', description: 'Analysis of the current sales pipeline and its health.' },
  { id: '3', name: 'Lead Conversion Report', description: 'Report on lead conversion rates and sources.' },
  { id: '4', name: 'Sales Team Performance', description: 'Individual and team performance metrics.' },
  { id: '5', name: 'Revenue Forecast', description: 'Projected revenue based on current pipeline.' },
];

const ReportingCenter: React.FC<ReportingCenterProps> = ({ 
  reports, 
  onGenerateReport, 
  sendMessage 
}) => {
  const [customReportName, setCustomReportName] = React.useState('');

  const handleGenerateReport = (reportId: string) => {
    const reportOption = reportOptions.find(r => r.id === reportId);
    if (reportOption) {
      onGenerateReport(reportOption.name);
    }
  };

  const handleCustomReport = () => {
    if (customReportName.trim()) {
      onGenerateReport(customReportName);
      setCustomReportName('');
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Reporting Center
      </Typography>
      
      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <TextField
          label="Custom Report Name"
          variant="outlined"
          size="small"
          value={customReportName}
          onChange={(e) => setCustomReportName(e.target.value)}
          sx={{ flexGrow: 1 }}
        />
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={handleCustomReport}
          disabled={!customReportName.trim()}
        >
          Create Custom Report
        </Button>
      </Box>
      
      <Paper elevation={2} sx={{ p: 2 }}>
        <List>
          {reportOptions.map((report) => (
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
                  onClick={() => sendMessage(`Distribute report: ${report.name}`)}
                >
                  Distribute
                </Button>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      </Paper>
      
      {reports.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="h6" gutterBottom>
            Generated Reports
          </Typography>
          <Paper elevation={1} sx={{ p: 2 }}>
            <List>
              {reports.map((report, index) => (
                <ListItem key={index} divider>
                  <ListItemText
                    primary={report.name || `Report ${index + 1}`}
                    secondary={report.generatedAt || new Date().toISOString()}
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        </Box>
      )}
    </Box>
  );
};

export default ReportingCenter;


