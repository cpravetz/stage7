import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BaseAssistantPage } from '../shared/BaseAssistantPage';
import { Box, Grid, Paper, Typography, Button, Chip, Select, MenuItem, FormControl, InputLabel } from '@mui/material/index.js';
import { ConversationMessage } from '@cktmcs/sdk';
import { useParams } from 'react-router-dom';
import { ChatPanel } from '../../assistants/shared/components/ChatPanel';
import { executiveAssistantClient, hrAssistantClient, marketingAssistantClient, salesAssistantClient } from '../shared/assistantClients';

interface AssistantRenderProps {
  messages: ConversationMessage[];
  sendMessage: (message: string) => Promise<void>;
  sendEvent: (event: any) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  humanInputRequired: { prompt: string; type: string; metadata: any; inputStepId: string; } | null;
  submitHumanInput: (response: string, inputStepId: string) => void;
  conversationId: string;
  assistantState: any;
  getState: (collectionName: string) => any[];
  mergeAssistantState: (updates: any) => void;
}

type PerformanceDomain = 'executive' | 'hr' | 'marketing' | 'sales';

const PerformanceAnalyticsPageView: React.FC<AssistantRenderProps> = ({ 
  messages, sendMessage, sendEvent, isLoading, error, humanInputRequired, submitHumanInput,
  conversationId, assistantState, getState
}) => {
  const [selectedDomain, setSelectedDomain] = useState<PerformanceDomain>('executive');

  const buildEvent = useCallback((eventType: string, payload: any, entityId?: string) => ({
    type: eventType,
    payload: { ...payload, conversationId },
    entityId: entityId || 'perf-' + Date.now()
  }), [conversationId]);

  useEffect(() => {
    getState('businessUnit');
    getState('employee');
    getState('campaign');
    getState('performanceMetric');
    getState('program');
  }, [getState]);

  const businessUnits = useMemo(() => getState('businessUnit') || [], [assistantState]);
  const employees = useMemo(() => getState('employee') || [], [assistantState]);
  const campaigns = useMemo(() => getState('campaign') || [], [assistantState]);
  const metrics = useMemo(() => getState('performanceMetric') || [], [assistantState]);
  const programs = useMemo(() => getState('program') || [], [assistantState]);

  const getDomainData = () => {
    switch(selectedDomain) {
      case 'executive':
        return { items: businessUnits, metrics, programs };
      case 'hr':
        return { items: employees, metrics, programs };
      case 'marketing':
        return { items: campaigns, metrics, programs };
      case 'sales':
        return { items: campaigns, metrics, programs };
      default:
        return { items: [], metrics: [], programs: [] };
    }
  };

  const domainData = getDomainData();

  return (
    <Box sx={{ display: 'flex', height: '100vh', width: '100%' }}>
      {/* Left Sidebar - Domain Selector */}
      <Box sx={{
        width: 300,
        borderRight: '1px solid #e0e0e0',
        p: 2,
        overflowY: 'auto',
        backgroundColor: '#f5f5f5'
      }}>
        <Typography variant="h6" gutterBottom>Performance Analytics</Typography>
        
        <FormControl fullWidth sx={{ mb: 3 }}>
          <InputLabel>Domain</InputLabel>
          <Select
            value={selectedDomain}
            label="Domain"
            onChange={(e) => setSelectedDomain(e.target.value as PerformanceDomain)}
          >
            <MenuItem value="executive">Executive Performance</MenuItem>
            <MenuItem value="hr">HR Performance</MenuItem>
            <MenuItem value="marketing">Marketing Performance</MenuItem>
            <MenuItem value="sales">Sales Performance</MenuItem>
          </Select>
        </FormControl>

        <Typography variant="subtitle2" gutterBottom>Quick Stats</Typography>
        <Box sx={{ mb: 2 }}>
          <Chip label={`Items: ${domainData.items.length}`} size="small" sx={{ mr: 1, mb: 1 }} />
          <Chip label={`Metrics: ${domainData.metrics.length}`} size="small" sx={{ mr: 1, mb: 1 }} />
          <Chip label={`Programs: ${domainData.programs.length}`} size="small" sx={{ mb: 1 }} />
        </Box>
      </Box>

      {/* Main Content Area */}
      <Box sx={{
        flexGrow: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <Box sx={{
          p: 2,
          borderBottom: '1px solid #e0e0e0',
          backgroundColor: '#fafafa'
        }}>
          <Typography variant="h5">
            {selectedDomain.charAt(0).toUpperCase() + selectedDomain.slice(1)} Performance Analytics
          </Typography>
        </Box>

        {/* Chat and Dashboard */}
        <Box sx={{
          display: 'flex',
          gap: 2,
          flexGrow: 1,
          overflow: 'hidden',
          p: 2
        }}>
          {/* Chat Panel */}
          <Box sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <ChatPanel messages={messages} onSendMessage={sendMessage} isLoading={isLoading} error={error} assistantName="Performance Analytics" enableVoiceInput={true} />
          </Box>

          {/* Dashboard Panel */}
          <Box sx={{
            width: 350,
            borderLeft: '1px solid #e0e0e0',
            p: 2,
            overflowY: 'auto'
          }}>
            <Typography variant="h6" gutterBottom>Dashboard</Typography>
            
            {/* Items Grid */}
            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Top Items</Typography>
            <Grid container spacing={1}>
              {domainData.items.slice(0, 3).map((item: any) => (
                <Grid item xs={12} key={item.id}>
                  <Paper sx={{ p: 1 }}>
                    <Typography variant="body2">{item.name}</Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>

            {/* Metrics */}
            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Key Metrics</Typography>
            <Grid container spacing={1}>
              {domainData.metrics.slice(0, 3).map((metric: any) => (
                <Grid item xs={12} key={metric.id}>
                  <Paper sx={{ p: 1 }}>
                    <Typography variant="body2">{metric.name}</Typography>
                    <Typography variant="caption">{metric.currentValue}/{metric.targetValue}</Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>

            {/* Programs */}
            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Programs</Typography>
            <Grid container spacing={1}>
              {domainData.programs.slice(0, 3).map((program: any) => (
                <Grid item xs={12} key={program.id}>
                  <Paper sx={{ p: 1 }}>
                    <Typography variant="body2">{program.name}</Typography>
                    <Typography variant="caption">{program.status}</Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export const PerformanceAnalyticsPage: React.FC<{ clientId: string }> = ({ clientId }) => {
  return (
    <BaseAssistantPage
      title="Performance Analytics"
      description="Analyze performance metrics across executive, HR, marketing, and sales domains with comprehensive analytics and insights."
      client={executiveAssistantClient}
      initialPrompt="Hello! I need help analyzing performance metrics."
      clientId={clientId}
    >
      {(props) => <PerformanceAnalyticsPageView {...props} conversationId={clientId} />}
    </BaseAssistantPage>
  );
};

export default PerformanceAnalyticsPage;
