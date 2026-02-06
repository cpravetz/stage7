import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BaseAssistantPage } from '../shared/BaseAssistantPage';
import { eventAssistantClient } from '../shared/assistantClients';
import { ConversationMessage } from '@cktmcs/sdk';
import { Box, Typography, useTheme, useMediaQuery, Tabs, Tab, IconButton } from '@mui/material';
import { Menu as MenuIcon, Close as CloseIcon, Event as EventIcon, People as PeopleIcon, AttachMoney as AttachMoneyIcon, Business as BusinessIcon, Timeline as TimelineIcon, CompareArrows as CompareArrowsIcon, Monitor as MonitorIcon, Folder as FolderIcon, Analytics as AnalyticsIcon } from '@mui/icons-material';

// Import existing components
import EventPlanningHub from './EventPlanningHub';
import VendorCoordinationCenter from './VendorCoordinationCenter';
import BudgetDashboard from './BudgetDashboard';
import AttendeeManagementPanel from './AttendeeManagementPanel';
import TimelineAndTaskManager from './TimelineAndTaskManager';
import VenueComparisonTool from './VenueComparisonTool';
import RealTimeEventMonitor from './RealTimeEventMonitor';
import DocumentRepository from './DocumentRepository';
import PostEventAnalytics from './PostEventAnalytics';
import { ChatPanel } from '../../assistants/shared/components/ChatPanel';
import {
  AttendeeStats,
  VendorStatus,
  AttendeeCheckInStats
} from './types';

interface AssistantRenderProps {
    messages: ConversationMessage[];
    sendMessage: (message: string) => Promise<void>;
    sendEvent: (event: any) => Promise<void>;
    assistantState?: Record<string, any>;
    getState: (collectionName: string) => any[];
    mergeAssistantState: (collection: string, items: any[]) => void;
    conversationId?: string;
    isLoading: boolean;
    error: string | null;
    humanInputRequired: { prompt: string; type: string; metadata: any; inputStepId: string; } | null;
    submitHumanInput: (response: string, inputStepId: string) => void;
    clientId: string;
}

const EventPlannerAssistantPageView: React.FC<AssistantRenderProps> = ({ 
  messages, 
  sendMessage, 
  sendEvent, 
  assistantState = {}, 
  getState = () => [], 
  mergeAssistantState = () => {}, 
  conversationId, 
  isLoading, 
  error, 
  humanInputRequired, 
  submitHumanInput, 
  clientId 
}) => {
  const [activeTab, setActiveTab] = useState(0);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);

  const buildEvent = useCallback((eventType: string, payload: any, entityId?: string) => ({
    type: eventType,
    payload: { ...payload, conversationId },
    entityId: entityId || payload.id || `${eventType}-${Date.now()}`
  }), [conversationId]);

  useEffect(() => {
    if (conversationId) {
      const collections = ['vendor', 'budgetData', 'attendee', 'task', 'venue', 'document', 'analyticsData'];
      collections.forEach(collection => {
        sendEvent(buildEvent(`domain.${collection}.load`, { conversationId }));
      });
    }
  }, [conversationId, getState, sendEvent, buildEvent]);

  // Use SDK state instead of local useState
  const vendors = useMemo(() => 
    getState('vendor') || assistantState.vendor || [],
    [assistantState, getState]
  );

  const budgetData = useMemo(() => 
    (getState('budgetData') || [])[0] || assistantState.budgetData || { totalBudget: 0, spent: 0, remaining: 0, categories: [] },
    [assistantState, getState]
  );

  const attendees = useMemo(() => 
    getState('attendee') || assistantState.attendee || [],
    [assistantState, getState]
  );

  const attendeeStats = useMemo(() => 
    (getState('attendeeStats') || [])[0] || assistantState.attendeeStats || {
      totalInvited: 0,
      confirmed: 0,
      pending: 0,
      declined: 0,
      checkedIn: 0,
    },
    [assistantState, getState]
  );

  const tasks = useMemo(() => 
    getState('task') || assistantState.task || [],
    [assistantState, getState]
  );

  const venues = useMemo(() => 
    getState('venue') || assistantState.venue || [],
    [assistantState, getState]
  );

  const monitorVendorStatus = useMemo(() => 
    getState('monitorVendorStatus') || assistantState.monitorVendorStatus || [],
    [assistantState, getState]
  );

  const monitorAttendeeStats = useMemo(() => 
    (getState('monitorAttendeeStats') || [])[0] || assistantState.monitorAttendeeStats || {
      expected: 0,
      checkedIn: 0,
      remaining: 0,
      checkInRate: '0/min',
    },
    [assistantState, getState]
  );

  const documents = useMemo(() => 
    getState('document') || assistantState.document || [],
    [assistantState, getState]
  );

  const analytics = useMemo(() => 
    (getState('analyticsData') || [])[0] || assistantState.analyticsData || { overallRating: 0, attendeeSatisfaction: 0, budgetAccuracy: 0, vendorPerformance: 0, feedbackCount: 0, keyMetrics: [] },
    [assistantState, getState]
  );

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const toggleLeftPanel = () => setLeftPanelOpen(!leftPanelOpen);
  const toggleRightPanel = () => setRightPanelOpen(!rightPanelOpen);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  return (
    <Box sx={{ display: 'flex', height: '100%', width: '100%' }}>
      {/* Left Panel - Event Planning Tools */}
      {(leftPanelOpen || !isMobile) && (
        <Box sx={{
          width: leftPanelOpen ? { xs: '100%', md: 350 } : 0,
          transition: 'width 0.3s ease',
          overflow: 'hidden',
          display: { xs: leftPanelOpen ? 'block' : 'none', md: 'block' },
          height: '100%',
          borderRight: '1px solid #e0e0e0',
          overflowY: 'auto'
        }}>
          <Box sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Event Planning Tools
            </Typography>

            <Tabs
              value={activeTab}
              onChange={handleTabChange}
              orientation="vertical"
              variant="scrollable"
              sx={{ borderRight: 1, borderColor: 'divider' }}
              aria-label="event planning tools tabs"
            >
              <Tab label="Event Planning Hub" icon={<EventIcon />} iconPosition="start" />
              <Tab label="Vendor Coordination" icon={<BusinessIcon />} iconPosition="start" />
              <Tab label="Budget Dashboard" icon={<AttachMoneyIcon />} iconPosition="start" />
              <Tab label="Attendee Management" icon={<PeopleIcon />} iconPosition="start" />
              <Tab label="Timeline & Tasks" icon={<TimelineIcon />} iconPosition="start" />
              <Tab label="Venue Comparison" icon={<CompareArrowsIcon />} iconPosition="start" />
              <Tab label="Event Monitor" icon={<MonitorIcon />} iconPosition="start" />
              <Tab label="Document Repository" icon={<FolderIcon />} iconPosition="start" />
              <Tab label="Post-Event Analytics" icon={<AnalyticsIcon />} iconPosition="start" />
            </Tabs>
          </Box>
        </Box>
      )}

      {/* Main Content Area */}
      <Box sx={{
        flexGrow: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
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
            Event Planner Assistant
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

        <ChatPanel messages={messages} onSendMessage={sendMessage} isLoading={isLoading} error={error} assistantName="Event Planner Assistant" enableVoiceInput={true} />
      </Box>

      {/* Right Panel - Active Tool Content */}
      {(rightPanelOpen || !isMobile) && (
        <Box sx={{
          width: rightPanelOpen ? { xs: '100%', md: 400 } : 0,
          transition: 'width 0.3s ease',
          overflow: 'hidden',
          display: { xs: rightPanelOpen ? 'block' : 'none', md: 'block' },
          height: '100%',
          borderLeft: '1px solid #e0e0e0',
          overflowY: 'auto',
          p: 2
        }}>
          {activeTab === 0 && <EventPlanningHub sendMessage={sendMessage} />}
          {activeTab === 1 && <VendorCoordinationCenter vendors={vendors} sendMessage={sendMessage} />}
          {activeTab === 2 && <BudgetDashboard budgetData={budgetData} sendMessage={sendMessage} />}
          {activeTab === 3 && <AttendeeManagementPanel attendees={attendees} stats={attendeeStats} sendMessage={sendMessage} />}
          {activeTab === 4 && <TimelineAndTaskManager tasks={tasks} sendMessage={sendMessage} />}
          {activeTab === 5 && <VenueComparisonTool venues={venues} sendMessage={sendMessage} />}
          {activeTab === 6 && <RealTimeEventMonitor vendorStatus={monitorVendorStatus} attendeeStats={monitorAttendeeStats} sendMessage={sendMessage} />}
          {activeTab === 7 && <DocumentRepository documents={documents} sendMessage={sendMessage} />}
          {activeTab === 8 && <PostEventAnalytics analytics={analytics} sendMessage={sendMessage} />}
        </Box>
      )}
    </Box>
  );
};


const EventPlannerAssistantPage: React.FC<{ clientId: string }> = ({ clientId }) => {
  return (
    <BaseAssistantPage
      title="Event Planner Assistant"
      description="Comprehensive event planning assistance with vendor coordination, budget tracking, attendee management, and real-time monitoring."
      client={eventAssistantClient}
      initialPrompt="Hello! I need help planning an event."
      clientId={clientId}
    >
      {(props) => <EventPlannerAssistantPageView {...props} clientId={clientId} />}
    </BaseAssistantPage>
  );
};

export default EventPlannerAssistantPage;


