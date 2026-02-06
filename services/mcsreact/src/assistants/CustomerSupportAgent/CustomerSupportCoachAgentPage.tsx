import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BaseAssistantPage } from '../shared/BaseAssistantPage';
import { customerSupportAssistantClient } from '../shared/assistantClients';
import { ConversationMessage } from '@cktmcs/sdk';
import { Box, Typography, useTheme, useMediaQuery, Tabs, Tab, IconButton } from '@mui/material';
import { Menu as MenuIcon, Close as CloseIcon } from '@mui/icons-material';

// Import existing components
import ContinuousImprovementPlanner from './ContinuousImprovementPlanner';
import Customer360View from './Customer360View';
import EscalationManagementCenter from './EscalationManagementCenter';
import MultiChannelInbox from './MultiChannelInbox';
import PerformanceAnalyticsHub from './PerformanceAnalyticsHub';
import ResponseTemplateLibrary from './ResponseTemplateLibrary';
import KnowledgeBaseIntegration from './KnowledgeBaseIntegration';
import TicketManagementCenter from './TicketManagementCenter';
import SentimentMonitoringDashboard from './SentimentMonitoringDashboard';
import { ChatPanel } from '../../assistants/shared/components/ChatPanel';

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
    mergeAssistantState: (collection: string, items: any[]) => void;
}

const CustomerSupportCoachAgentPageView: React.FC<AssistantRenderProps> = ({ 
    messages, sendMessage, sendEvent, isLoading, error, humanInputRequired, submitHumanInput, 
    conversationId, assistantState, getState = () => []
}) => {
  const [activeTab, setActiveTab] = useState(0);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const toggleLeftPanel = () => setLeftPanelOpen(!leftPanelOpen);
  const toggleRightPanel = () => setRightPanelOpen(!rightPanelOpen);

  const buildEvent = useCallback((eventType: string, payload: any, entityId?: string) => ({
    type: eventType,
    payload: { ...payload, conversationId },
    entityId: entityId || 'support-' + Date.now()
  }), [conversationId]);

  useEffect(() => {
    getState('ticket');
    getState('customer');
    getState('escalation');
    getState('improvement');
    getState('responseTemplate');
    getState('sentimentData');
  }, [getState]);

  const tickets = useMemo(() => getState('ticket') || [], [assistantState]);
  const customers = useMemo(() => getState('customer') || [], [assistantState]);
  const escalations = useMemo(() => getState('escalation') || [], [assistantState]);
  const improvements = useMemo(() => getState('improvement') || [], [assistantState]);
  const responseTemplates = useMemo(() => getState('responseTemplate') || [], [assistantState]);
  const sentimentData = useMemo(() => getState('sentimentData') || [], [assistantState]);

  return (
    <Box sx={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* Left Panel - Support Tools */}
      {(leftPanelOpen || !isMobile) && (
        <Box sx={{
          width: leftPanelOpen ? { xs: '100%', md: 350 } : 0,
          transition: 'width 0.3s ease',
          overflow: 'hidden',
          display: { xs: leftPanelOpen ? 'block' : 'none', md: 'block' },
          height: '100vh',
          borderRight: '1px solid #e0e0e0',
          overflowY: 'auto'
        }}>
          <Box sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Support Tools
            </Typography>

            <Tabs
              value={activeTab}
              onChange={(e, newValue) => setActiveTab(newValue)}
              orientation="vertical"
              variant="scrollable"
              sx={{ borderRight: 1, borderColor: 'divider' }}
            >
              <Tab label="Ticket Management" />
              <Tab label="Customer Communication" />
              <Tab label="Knowledge Base" />
              <Tab label="Performance Analytics" />
              <Tab label="Live Chat" />
              <Tab label="Escalation Workflow" />
              <Tab label="Continuous Improvement" />
              <Tab label="Customer 360 View" />
              <Tab label="Response Templates" />
              <Tab label="Sentiment Monitoring" />
            </Tabs>
          </Box>
        </Box>
      )}

      {/* Main Content Area */}
      <Box sx={{
        flexGrow: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden'
      }}>
        {/* Header with Title and Panel Toggles */}
        <Box sx={{
          p: 2,
          borderBottom: '1px solid #e0e0e0',
          backgroundColor: theme.palette.background.paper,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <Typography variant="h5" fontWeight="bold">
            Customer Support Agent
          </Typography>
          <Box>
            {!isMobile && (
              <IconButton onClick={toggleLeftPanel} sx={{ mr: 1 }}>
                {leftPanelOpen ? <CloseIcon fontSize="small" /> : <MenuIcon fontSize="small" />}
              </IconButton>
            )}
            <IconButton onClick={toggleRightPanel}>
              {rightPanelOpen ? <CloseIcon fontSize="small" /> : <MenuIcon fontSize="small" />}
            </IconButton>
          </Box>
        </Box>

        {/* The conversation area */}
        <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
            <ChatPanel messages={messages} onSendMessage={sendMessage} isLoading={isLoading} error={error} assistantName="Customer Support Agent" enableVoiceInput={true} />
        </Box>
      </Box>

      {/* Right Panel - Active Tool Content */}
      {(rightPanelOpen || !isMobile) && (
        <Box sx={{
          width: rightPanelOpen ? { xs: '100%', md: 400 } : 0,
          transition: 'width 0.3s ease',
          overflow: 'hidden',
          display: { xs: rightPanelOpen ? 'block' : 'none', md: 'block' },
          height: '100vh',
          borderLeft: '1px solid #e0e0e0',
          overflowY: 'auto',
          p: 2
        }}>
          {activeTab === 0 && <TicketManagementCenter conversationId={conversationId} client={customerSupportAssistantClient} setError={() => {}} />}
          {activeTab === 1 && <MultiChannelInbox conversationId={conversationId} client={customerSupportAssistantClient} setError={() => {}} />}
          {activeTab === 2 && <KnowledgeBaseIntegration conversationId={conversationId} client={customerSupportAssistantClient} setError={() => {}} />}
          {activeTab === 3 && <PerformanceAnalyticsHub conversationId={conversationId} client={customerSupportAssistantClient} setError={() => {}} />}
          {activeTab === 4 && <ChatPanel messages={messages} onSendMessage={sendMessage} isLoading={isLoading} error={error} assistantName="Live Chat Support" enableVoiceInput={true} />}
          {activeTab === 5 && <EscalationManagementCenter conversationId={conversationId} client={customerSupportAssistantClient} setError={() => {}} />}
          {activeTab === 6 && <ContinuousImprovementPlanner conversationId={conversationId} client={customerSupportAssistantClient} setError={() => {}} />}
          {activeTab === 7 && <Customer360View conversationId={conversationId} customerId={selectedCustomerId} client={customerSupportAssistantClient} setError={() => {}} />}
          {activeTab === 8 && <ResponseTemplateLibrary conversationId={conversationId} client={customerSupportAssistantClient} setError={() => {}} />}
          {activeTab === 9 && <SentimentMonitoringDashboard />}
        </Box>
      )}
    </Box>
  );
};

export const CustomerSupportCoachAgentPage: React.FC<{ clientId: string }> = ({ clientId }) => {
  return (
    <BaseAssistantPage
      title="Customer Support Agent"
      description="Manage customer support tickets, live chat, knowledge base, performance analytics, and escalation workflows with comprehensive support management tools."
      client={customerSupportAssistantClient}
      initialPrompt="Hello! I need help managing customer support tickets and inquiries."
      clientId={clientId}
    >
      {(props) => <CustomerSupportCoachAgentPageView {...props} conversationId={clientId} />}
    </BaseAssistantPage>
  );
};

export default CustomerSupportCoachAgentPage;
