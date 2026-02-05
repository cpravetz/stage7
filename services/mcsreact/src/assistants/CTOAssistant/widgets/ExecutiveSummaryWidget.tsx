import React from 'react';
import { Paper, Typography, Grid, Avatar } from '@mui/material';
import { CheckCircleOutline, ErrorOutline, WarningAmber } from '@mui/icons-material';

interface ExecutiveSummaryWidgetProps {
  activeIncidents: number;
  criticalVulnerabilities: number;
}

export const ExecutiveSummaryWidget: React.FC<ExecutiveSummaryWidgetProps> = ({ activeIncidents, criticalVulnerabilities }) => {
  const systemStatus = activeIncidents > 0 || criticalVulnerabilities > 0 ? 'Action Required' : 'Nominal';
  const statusColor = systemStatus === 'Nominal' ? 'success.main' : 'warning.main';
  const StatusIcon = systemStatus === 'Nominal' ? CheckCircleOutline : WarningAmber;

  return (
    <Paper elevation={3} sx={{ p: 2, backgroundColor: '#1a237e', color: 'white' }}>
      <Grid container alignItems="center" spacing={2}>
        <Grid item>
          <Avatar sx={{ bgcolor: statusColor, width: 56, height: 56 }}>
            <StatusIcon sx={{ fontSize: 40 }}/>
          </Avatar>
        </Grid>
        <Grid item xs>
          <Typography variant="h5">Executive Summary</Typography>
          <Typography variant="body1">System Status: {systemStatus}</Typography>
        </Grid>
        <Grid item>
          <Paper sx={{ p: 1.5, textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.1)', color: 'white' }}>
            <ErrorOutline />
            <Typography variant="h6">{activeIncidents}</Typography>
            <Typography variant="caption">Active Incidents</Typography>
          </Paper>
        </Grid>
        <Grid item>
          <Paper sx={{ p: 1.5, textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.1)', color: 'white' }}>
            <WarningAmber />
            <Typography variant="h6">{criticalVulnerabilities}</Typography>
            <Typography variant="caption">Critical Vulnerabilities</Typography>
          </Paper>
        </Grid>
      </Grid>
    </Paper>
  );
};


