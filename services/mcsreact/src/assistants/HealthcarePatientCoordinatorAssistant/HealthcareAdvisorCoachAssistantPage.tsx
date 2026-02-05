import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BaseAssistantPage } from '../shared/BaseAssistantPage';
import { healthcareAssistantClient } from '../shared/assistantClients';
import { Box, Typography, useTheme, useMediaQuery, Tabs, Tab, IconButton } from '@mui/material';
import { Menu as MenuIcon, Close as CloseIcon, CalendarToday, MedicalServices, People, Assessment, LibraryBooks, Analytics, AttachFile, Schedule, Feedback, Help } from '@mui/icons-material';
import { ConversationMessage } from '@cktmcs/sdk';

// Import existing components
import AppointmentCoordinationHub from './AppointmentCoordinationHub';
import CarePlanManager from './CarePlanManager';
import HealthcareAnalyticsDashboard from './HealthcareAnalyticsDashboard';
import MedicalRecordOrganizer from './MedicalRecordOrganizer';
import PatientCommunicationCenter from './PatientCommunicationCenter';
import PatientTimelineView from './PatientTimelineView';
import PatientTriageCenter from './PatientTriageCenter';
import ProviderCollaborationTools from './ProviderCollaborationTools';
import ResourceCoordinationDashboard from './ResourceCoordinationDashboard';
import RiskAssessmentPanel from './RiskAssessmentPanel';
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
    mergeAssistantState: (updates: any) => void;
}

const HealthcareAdvisorCoachAssistantPageView: React.FC<AssistantRenderProps> = ({ 
    messages, sendMessage, sendEvent, isLoading, error, humanInputRequired, submitHumanInput, 
    conversationId, assistantState, getState 
}) => {
  const [activeTab, setActiveTab] = useState(0);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const toggleLeftPanel = () => setLeftPanelOpen(!leftPanelOpen);
  const toggleRightPanel = () => setRightPanelOpen(!rightPanelOpen);

  const buildEvent = useCallback((eventType: string, payload: any, entityId?: string) => ({
    type: eventType,
    payload: { ...payload, conversationId },
    entityId: entityId || 'healthcare-' + Date.now()
  }), [conversationId]);

  useEffect(() => {
    getState('appointment');
    getState('carePlan');
    getState('patient');
    getState('medicalRecord');
    getState('triage');
    getState('riskAssessment');
    getState('collaboration');
    getState('resource');
    getState('analyticsData');
  }, [getState]);

  const appointments = useMemo(() => getState('appointment') || [], [assistantState]);
  const carePlans = useMemo(() => getState('carePlan') || [], [assistantState]);
  const patients = useMemo(() => getState('patient') || [], [assistantState]);
  const medicalRecords = useMemo(() => getState('medicalRecord') || [], [assistantState]);
  const triageData = useMemo(() => getState('triage') || [], [assistantState]);
  const riskAssessments = useMemo(() => getState('riskAssessment') || [], [assistantState]);
  const collaborations = useMemo(() => getState('collaboration') || [], [assistantState]);
  const resources = useMemo(() => getState('resource') || [], [assistantState]);
  const analytics = useMemo(() => getState('analyticsData') || [], [assistantState]);

  return (
    <Box sx={{ display: 'flex', height: '100%', width: '100%' }}>
      {/* Left Panel - Healthcare Tools */}
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
              Healthcare Tools
            </Typography>

            <Tabs
              value={activeTab}
              onChange={(e, newValue) => setActiveTab(newValue)}
              orientation="vertical"
              variant="scrollable"
              sx={{ borderRight: 1, borderColor: 'divider' }}
            >
              <Tab label="Appointment Coordination" icon={<CalendarToday />} iconPosition="start" />
              <Tab label="Care Plan Manager" icon={<MedicalServices />} iconPosition="start" />
              <Tab label="Patient Timeline" icon={<People />} iconPosition="start" />
              <Tab label="Medical Records" icon={<LibraryBooks />} iconPosition="start" />
              <Tab label="Patient Triage" icon={<Assessment />} iconPosition="start" />
              <Tab label="Risk Assessment" icon={<Analytics />} iconPosition="start" />
              <Tab label="Provider Collaboration" icon={<AttachFile />} iconPosition="start" />
              <Tab label="Resource Coordination" icon={<Schedule />} iconPosition="start" />
              <Tab label="Analytics Dashboard" icon={<Feedback />} iconPosition="start" />
              <Tab label="Communication Center" icon={<Help />} iconPosition="start" />
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
            Healthcare Advisor Assistant
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

        <ChatPanel messages={messages} onSendMessage={sendMessage} isLoading={isLoading} error={error} assistantName="Healthcare Advisor Assistant" enableVoiceInput={true} />
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
          {activeTab === 0 && <AppointmentCoordinationHub onScheduleAppointment={() => {}} onRescheduleAppointment={() => {}} onCancelAppointment={() => {}} />}
          {activeTab === 1 && <CarePlanManager onCreateCarePlan={() => {}} onUpdateCarePlan={() => {}} />}
          {activeTab === 2 && <PatientTimelineView onViewTimeline={() => {}} />}
          {activeTab === 3 && <MedicalRecordOrganizer onUploadRecord={() => {}} onRetrieveRecord={() => {}} />}
          {activeTab === 4 && <PatientTriageCenter onTriagePatient={() => {}} />}
          {activeTab === 5 && <RiskAssessmentPanel />}
          {activeTab === 6 && <ProviderCollaborationTools />}
          {activeTab === 7 && <ResourceCoordinationDashboard />}
          {activeTab === 8 && <HealthcareAnalyticsDashboard />}
          {activeTab === 9 && <PatientCommunicationCenter />}
        </Box>
      )}
    </Box>
  );
};

export const HealthcareAdvisorCoachAssistantPage: React.FC<{ clientId: string }> = ({ clientId }) => {
  return (
    <BaseAssistantPage
      title="Healthcare Advisor Assistant"
      description="Coordinate patient care, manage appointments, organize medical records, assess risks, and facilitate provider collaboration with integrated healthcare management tools."
      client={healthcareAssistantClient}
      initialPrompt="Hello! I need help managing healthcare coordination and patient care."
      clientId={clientId}
    >
      {(props) => <HealthcareAdvisorCoachAssistantPageView {...props} conversationId={clientId} />}
    </BaseAssistantPage>
  );
};

export default HealthcareAdvisorCoachAssistantPage;
