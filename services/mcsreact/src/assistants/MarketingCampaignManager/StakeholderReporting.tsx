import React from 'react';
import { Box, Typography, Paper, Button, List, ListItem, ListItemText, ListItemSecondaryAction, Select, MenuItem, FormControl, InputLabel } from '@mui/material/index.js';
import {PictureAsPdf as PictureAsPdfIcon, Email as EmailIcon} from '@mui/icons-material';
import { StakeholderReport } from './types';

interface StakeholderReportingProps {
  reports: StakeholderReport[];
  onGenerateReport: (reportType: string) => void;
  sendMessage: (message: string) => Promise<any>;
}

const StakeholderReporting: React.FC<StakeholderReportingProps> = ({
  reports,
  onGenerateReport,
  sendMessage
}) => {
  const [reportType, setReportType] = React.useState<string>('executive');

  const handleGenerateReport = () => {
    onGenerateReport(reportType);
  };

  const handleDistributeReport = (reportId: string) => {
    sendMessage(`Distribute report ${reportId}`);
  };

  const handleDownloadReport = (reportId: string) => {
    sendMessage(`Download report ${reportId}`);
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" gutterBottom>
          Stakeholder Reporting
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Report Type</InputLabel>
            <Select
              value={reportType}
              label="Report Type"
              onChange={(e) => setReportType(e.target.value)}
            >
              <MenuItem value="executive">Executive Summary</MenuItem>
              <MenuItem value="detailed">Detailed Performance Report</MenuItem>
              <MenuItem value="performance">Performance Analysis</MenuItem>
            </Select>
          </FormControl>
          <Button
            variant="contained"
            color="primary"
            startIcon={<PictureAsPdfIcon />}
            onClick={handleGenerateReport}
          >
            Generate Report
          </Button>
        </Box>
      </Box>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Generated Reports
        </Typography>
        <List>
          {reports.map((report) => (
            <ListItem key={report.id} divider>
              <ListItemText
                primary={report.title}
                secondary={
                  <>
                    <Typography component="span" variant="body2" color="text.primary">
                      {report.reportType} Report
                    </Typography>
                    <br />
                    Generated: {new Date(report.generatedDate).toLocaleDateString()}
                  </>
                }
              />
              <ListItemSecondaryAction>
                <Button
                  variant="outlined"
                  color="primary"
                  size="small"
                  sx={{ mr: 1 }}
                  startIcon={<PictureAsPdfIcon />}
                  onClick={() => handleDownloadReport(report.id)}
                >
                  Download PDF
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

export default StakeholderReporting;


