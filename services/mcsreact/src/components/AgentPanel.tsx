import React from 'react';
import { Box, Typography, Paper, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, useTheme, Accordion, AccordionSummary, AccordionDetails, List, ListItem, ListItemText } from '@mui/material/index.js';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { AgentStatistics } from '../shared-browser';

interface AgentPanelProps {
  agentStatistics: Map<string, Array<AgentStatistics>>;
}

const getStatusColor = (status: string): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' => {
  switch (status.toLowerCase()) {
    case 'running':
      return 'primary';
    case 'completed':
      return 'success';
    case 'error':
      return 'error';
    case 'pending':
      return 'warning';
    case 'waiting':
      return 'info';
    default:
      return 'default';
  }
};

export const AgentPanel: React.FC<AgentPanelProps> = ({ agentStatistics }) => {
  const theme = useTheme();

  const agents: AgentStatistics[] = [];
  agentStatistics.forEach((agentList) => {
    agents.push(...agentList);
  });

  if (agents.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No agents available. Create or load a mission to see agent details.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, height: '100%', overflow: 'auto' }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Mission Agents ({agents.length})
      </Typography>
      {agents.map((agent) => (
        <Accordion key={agent.id} sx={{ mb: 1 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
              <Chip
                label={agent.status}
                color={getStatusColor(agent.status)}
                size="small"
              />
              <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
                {agent.id}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Task {agent.currentTaskNo}/{agent.taskCount}
              </Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Current Task
                </Typography>
                <Typography variant="body1">
                  {agent.currentTaskVerb || 'Idle'}
                </Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Steps
                </Typography>
                {agent.steps && agent.steps.length > 0 ? (
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Step</TableCell>
                          <TableCell>Verb</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell>Dependencies</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {agent.steps.map((step) => (
                          <TableRow key={step.id}>
                            <TableCell>{step.id.slice(0, 8)}...</TableCell>
                            <TableCell>{step.verb}</TableCell>
                            <TableCell>
                              <Chip
                                label={step.status}
                                color={getStatusColor(step.status)}
                                size="small"
                                variant="outlined"
                              />
                            </TableCell>
                            <TableCell>
                              {step.dependencies.length > 0 ? step.dependencies.join(', ') : 'None'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No steps assigned yet
                  </Typography>
                )}
              </Box>
            </Box>
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
};
