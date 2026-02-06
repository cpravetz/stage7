import React, { useState, useEffect, useCallback } from 'react';
import { BaseAssistantPage } from '../shared/BaseAssistantPage';
import { CustomerSupportAssistantClient } from './CustomerSupportAssistantClient';
import { ConversationMessage } from '@cktmcs/sdk';
import { Typography, Box, IconButton, useTheme, useMediaQuery, Tabs, Tab, Paper, List, ListItem, ListItemText, Divider, Chip, LinearProgress, CircularProgress, Alert, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Checkbox, FormControlLabel, Switch, Slider, Accordion, AccordionSummary, AccordionDetails, TextareaAutosize, Grid, Avatar, Badge, Tooltip, Fab } from '@mui/material/index.js'; // Removed unused TextField, Button, FormControl, InputLabel, Select, MenuItem, FormHelperText, Card
import { EscalatorWarning as EscalatorWarningIcon, QuestionAnswer as QuestionAnswerIcon, Assignment as AssignmentIcon, Visibility as VisibilityIcon, TrendingUp as TrendingUpIcon, Add as AddIcon, People as PeopleIcon, LibraryBooks as LibraryBooksIcon, Chat as ChatIcon, BarChart as BarChartIcon, Menu as MenuIcon, Close as CloseIcon, Search as SearchIcon, Edit as EditIcon, HeadsetMic as HeadsetMicIcon } from '@mui/icons-material';
import { API_BASE_URL, WS_URL } from '../../config';

import ContinuousImprovementPlanner from './ContinuousImprovementPlanner';
import Customer360View from './Customer360View';
import EscalationManagementCenter from './EscalationManagementCenter';
import MultiChannelInbox from './MultiChannelInbox';
import PerformanceAnalyticsHub from './PerformanceAnalyticsHub';
import ResponseTemplateLibrary from './ResponseTemplateLibrary';
import KnowledgeBaseIntegration from './KnowledgeBaseIntegration';
import TicketManagementCenter from './TicketManagementCenter'; // Extracted component
import { ChatPanel } from '../../assistants/shared/components/ChatPanel';

const customerSupportAssistantClient = new CustomerSupportAssistantClient(
  `${API_BASE_URL}/api/customer-support-assistant`,
  `${WS_URL}/ws/customer-support-assistant/conversations`
);

const CustomerSupportAgentPage: React.FC<{ clientId: string }> = ({ clientId }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // UI toggle functions
  const toggleLeftPanel = () => setLeftPanelOpen(!leftPanelOpen);
  const toggleRightPanel = () => setRightPanelOpen(!rightPanelOpen);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  return (
    <BaseAssistantPage
      title="Customer Support Agent"
      description="Your AI-powered customer support agent for ticket management, communication, knowledge base integration, and performance analytics."
      client={customerSupportAssistantClient}
      initialPrompt="Hello! I need help managing customer support tickets and inquiries."
      clientId={clientId}
    >
      {({ messages, sendMessage, isLoading, error, humanInputRequired, submitHumanInput }) => {
        const assistantName = "Customer Support Agent";

        // Update conversationId when we have messages
        React.useEffect(() => {
          if (messages.length > 0 && messages[0].metadata?.conversationId) {
            setConversationId(messages[0].metadata.conversationId);
          }
        }, [messages]);

        return (
          <Box sx={{
            display: 'flex',
            height: '100%', // Changed from 100vh to 100%
            width: '100%', // Changed from 100vw to 100%
            overflow: 'hidden'
          }}>
            {/* Left Panel - Support Tools */}
            {(leftPanelOpen || !isMobile) && (
              <Box sx={{
                width: leftPanelOpen ? { xs: '100%', md: 350 } : 0,
                transition: 'width 0.3s ease',
                overflow: 'hidden',
                display: { xs: leftPanelOpen ? 'block' : 'none', md: 'block' },
                height: '100%', // Changed from 100vh to 100%
                borderRight: '1px solid #e0e0e0',
                overflowY: 'auto'
              }}>
                <Box sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom>
                    Support Tools
                  </Typography>

                  <Tabs
                    value={activeTab}
                    onChange={handleTabChange}
                    orientation="vertical"
                    variant="scrollable"
                    sx={{ borderRight: 1, borderColor: 'divider' }}
                  >
                    <Tab label="Ticket Management" icon={<AssignmentIcon />} iconPosition="start" />
                    <Tab label="Customer Communication" icon={<ChatIcon />} iconPosition="start" />
                    <Tab label="Knowledge Base" icon={<LibraryBooksIcon />} iconPosition="start" />
                    <Tab label="Performance Analytics" icon={<BarChartIcon />} iconPosition="start" />
                    <Tab label="Live Chat" icon={<HeadsetMicIcon />} iconPosition="start" />
                    <Tab label="Escalation Workflow" icon={<EscalatorWarningIcon />} iconPosition="start" />
                    <Tab label="Continuous Improvement" icon={<TrendingUpIcon />} iconPosition="start" />
                    <Tab label="Customer 360 View" icon={<PeopleIcon />} iconPosition="start" />
                    <Tab label="Response Templates" icon={<QuestionAnswerIcon />} iconPosition="start" />
                  </Tabs>
                </Box>
              </Box>
            )}

            {/* Main Content Area */}
            <Box sx={{
              flexGrow: 1,
              display: 'flex',
              flexDirection: 'column',
              height: '100%', // Changed from 100vh to 100%
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

              {/* Standard Assistant Chat */}
              <ChatPanel messages={messages} onSendMessage={sendMessage} isLoading={isLoading} error={error} assistantName={assistantName || "Assistant"} enableVoiceInput={true} />
            </Box>

            {/* Right Panel - Active Tool Content */}
            {(rightPanelOpen || !isMobile) && (
              <Box sx={{
                width: rightPanelOpen ? { xs: '100%', md: 400 } : 0,
                transition: 'width 0.3s ease',
                overflow: 'hidden',
                display: { xs: rightPanelOpen ? 'block' : 'none', md: 'block' },
                height: '100%', // Changed from 100vh to 100%
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
                {activeTab === 6 && <ContinuousImprovementPlanner conversationId={conversationId} client={customerSupportAssistantClient} setError={() => {}}/>}
                {activeTab === 7 && <Customer360View conversationId={conversationId} customerId={selectedCustomerId} client={customerSupportAssistantClient} setError={() => {}} />}
                {activeTab === 8 && <ResponseTemplateLibrary conversationId={conversationId} client={customerSupportAssistantClient} setError={() => {}} />}
              </Box>
            )}
          </Box>
        );
      }}
    </BaseAssistantPage>
  );
};

export default CustomerSupportAgentPage;


