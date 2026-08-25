import React, { useMemo } from 'react';
import { Box, Typography, Paper, List, ListItem, ListItemText, Divider, Chip } from '@mui/material/index.js';
import { MissionStatistics } from '../shared-browser';

interface Props {
  statistics: MissionStatistics;
  activeMissionName: string | null;
  activeMission: boolean;

}

const StatisticsWindow: React.FC<Props> = ({ statistics, activeMissionName, activeMission }) => {
  const getMissionDisplay = () => {
    if (!activeMission) return "No mission running";
    if (activeMissionName) return activeMissionName;
    return "Unsaved mission";
  };

  const stepStatusTotals: Record<string, number> = useMemo(() => {
    const totals: Record<string, number> = {};
    if (statistics.agentStatistics instanceof Map) {
      for (const agents of statistics.agentStatistics.values()) {
        for (const agent of agents) {
          if (agent.steps) {
            for (const step of agent.steps) {
              totals[step.status] = (totals[step.status] || 0) + 1;
            }
          }
        }
      }
    }
    return totals;
  }, [statistics.agentStatistics]);

  // Get color for status
  const getStatusColor = (status: string): 'success' | 'error' | 'warning' | 'info' | 'default' => {
    switch (status.toLowerCase()) {
      case 'running':
      case 'completed':
        return 'success';
      case 'error':
      case 'failed':
        return 'error';
      case 'paused':
      case 'waiting':
        return 'warning';
      case 'pending':
        return 'info';
      default:
        return 'default';
    }
  };

  return (
    <Box sx={{ height: '100%', overflow: 'auto', p: 1 }}>
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 'medium', mb: 2 }}>
        Statistics
      </Typography>

      <Paper elevation={1} sx={{ p: 2, mb: 3, borderRadius: 2 }}>
        <Typography variant="subtitle1" color="text.secondary" gutterBottom>
          Mission Status
        </Typography>
        <Chip
          label={getMissionDisplay()}
          color={activeMission ? 'primary' : 'default'}
          sx={{ fontWeight: 'bold' }}
        />
      </Paper>

      <Paper elevation={1} sx={{ p: 2, mb: 3, borderRadius: 2 }}>
        <Typography variant="subtitle1" color="text.secondary" gutterBottom>
          Agents by Status
        </Typography>
        <List dense disablePadding>
          {!statistics.agentCountByStatus || Object.entries(statistics.agentCountByStatus).length === 0 ? (
            <ListItem>
              <ListItemText primary="No agent data available" />
            </ListItem>
          ) : (
            Object.entries(statistics.agentCountByStatus).map(([status, count]) => (
              <ListItem key={status} sx={{ py: 0.5 }}>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Chip
                        label={status}
                        size="small"
                        color={getStatusColor(status)}
                        sx={{ minWidth: '80px' }}
                      />
                      <Typography variant="body2" fontWeight="bold">
                        {count}
                      </Typography>
                    </Box>
                  }
                />
              </ListItem>
            ))
          )}
        </List>
      </Paper>

      <Paper elevation={1} sx={{ p: 2, mb: 3, borderRadius: 2 }}>
        <Typography variant="subtitle1" color="text.secondary" gutterBottom>
          Steps by Status
        </Typography>
        <List dense disablePadding>
          {Object.entries(stepStatusTotals).length === 0 ? (
            <ListItem>
              <ListItemText primary="No step data available" />
            </ListItem>
          ) : (
            Object.entries(stepStatusTotals).map(([status, count]: [string, number]) => (
              <ListItem key={status} sx={{ py: 0.5 }}>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Chip
                        label={status}
                        size="small"
                        color={getStatusColor(status)}
                        sx={{ minWidth: '80px' }}
                      />
                      <Typography variant="body2" fontWeight="bold">
                        {count}
                      </Typography>
                    </Box>
                  }
                />
              </ListItem>
            ))
          )}
        </List>
      </Paper>

      <Paper elevation={1} sx={{ p: 2, mb: 3, borderRadius: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="subtitle1" color="text.secondary" gutterBottom>
            LLM Usage
          </Typography>
          {statistics.activeLLMCalls > 0 &&
            <Typography variant="body2" sx={{
              animation: 'pulse 1s infinite',
              '@keyframes pulse': {
                '0%': { opacity: 1 },
                '50%': { opacity: 0.2 },
                '100%': { opacity: 1 },
              },
            }}>
              Thinking
            </Typography>
          }
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1 }}>
          <Typography variant="body1">Total Calls:</Typography>
          <Chip
            label={statistics.llmCalls}
            color="primary"
            sx={{ fontWeight: 'bold' }}
          />
        </Box>
      </Paper>

      <Paper elevation={1} sx={{ p: 2, mb: 3, lborderRadius: 2 }}>
        <Typography variant="subtitle1" color="text.secondary" gutterBottom>
          New Plugins
        </Typography>
        <List dense disablePadding>
          {!statistics.engineerStatistics || !statistics.engineerStatistics.newPlugins || statistics.engineerStatistics.newPlugins.length === 0 ? (
            <ListItem>
              <ListItemText primary="No new plugins created" />
            </ListItem>
          ) : (
            statistics.engineerStatistics.newPlugins.map((plugin: string) => (
              <ListItem key={plugin}>
                <ListItemText
                  primary={plugin}
                  primaryTypographyProps={{
                    variant: 'body2',
                    sx: { fontFamily: 'monospace' }
                  }}
                />
              </ListItem>
            ))
          )}
        </List>
      </Paper>
      <Paper elevation={1} sx={{ p: 2, borderRadius: 2 }}>
        <Typography variant="subtitle1" color="text.secondary" gutterBottom>
          Seakaytee
        </Typography>
      </Paper>
    </Box>
  );
};

export default StatisticsWindow;