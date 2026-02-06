import React, { useEffect, useCallback, useMemo } from 'react';
import { BaseAssistantPage } from '../shared/BaseAssistantPage';
import { educationAssistantClient } from '../shared/assistantClients';
import { ConversationMessage } from '@cktmcs/sdk';
import { Box, Typography, useTheme, useMediaQuery, Tabs, Tab, IconButton } from '@mui/material';
import { Menu as MenuIcon, Close as CloseIcon, School, People, Assessment, LibraryBooks, Analytics, AttachFile, Schedule, Feedback, Help } from '@mui/icons-material';

// Import existing components
import CollaborativeTeachingTools from './CollaborativeTeachingTools';
import PersonalizedTutoringCenter from './PersonalizedTutoringCenter';
import StudentProgressTimeline from './StudentProgressTimeline';
import CurriculumPlanningHub from './CurriculumPlanningHub';
import PerformanceAnalyticsDashboard from './PerformanceAnalyticsDashboard';
import ResourceOrganizationDashboard from './ResourceOrganizationDashboard';
import StudentEngagementCenter from './StudentEngagementCenter';
import AssessmentManagementSystem from './AssessmentManagementSystem';
import ContentCreationStudio from './ContentCreationStudio';
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

const EducationalTutorCoachAssistantPageView: React.FC<AssistantRenderProps> = ({ 
    messages, sendMessage, sendEvent, isLoading, error, humanInputRequired, submitHumanInput, 
    conversationId, assistantState, getState 
}) => {
  const [activeTab, setActiveTab] = React.useState(0);
  const [leftPanelOpen, setLeftPanelOpen] = React.useState(true);
  const [rightPanelOpen, setRightPanelOpen] = React.useState(true);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const toggleLeftPanel = () => setLeftPanelOpen(!leftPanelOpen);
  const toggleRightPanel = () => setRightPanelOpen(!rightPanelOpen);

  const buildEvent = useCallback((eventType: string, payload: any, entityId?: string) => ({
    type: eventType,
    payload: { ...payload, conversationId },
    entityId: entityId || 'education-' + Date.now()
  }), [conversationId]);

  useEffect(() => {
    getState('learningPlan');
    getState('student');
    getState('assessment');
    getState('curriculum');
    getState('analyticsData');
    getState('resource');
    getState('schedule');
    getState('engagement');
  }, [getState]);

  const learningPlans = useMemo(() => getState('learningPlan') || [], [assistantState]);
  const students = useMemo(() => getState('student') || [], [assistantState]);
  const assessments = useMemo(() => getState('assessment') || [], [assistantState]);
  const curriculum = useMemo(() => getState('curriculum') || [], [assistantState]);
  const analyticsData = useMemo(() => getState('analyticsData') || [], [assistantState]);
  const resources = useMemo(() => getState('resource') || [], [assistantState]);
  const schedules = useMemo(() => getState('schedule') || [], [assistantState]);
  const engagement = useMemo(() => getState('engagement') || [], [assistantState]);

  return (
    <Box sx={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* Left Panel - Educational Tools */}
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
              Educational Tools
            </Typography>

            <Tabs
              value={activeTab}
              onChange={(e, newValue) => setActiveTab(newValue)}
              orientation="vertical"
              variant="scrollable"
              sx={{ borderRight: 1, borderColor: 'divider' }}
            >
              <Tab label="Learning Plan Builder" icon={<School />} iconPosition="start" />
              <Tab label="Student Progress" icon={<People />} iconPosition="start" />
              <Tab label="Assessment Management" icon={<Assessment />} iconPosition="start" />
              <Tab label="Curriculum Library" icon={<LibraryBooks />} iconPosition="start" />
              <Tab label="Performance Analytics" icon={<Analytics />} iconPosition="start" />
              <Tab label="Resource Repository" icon={<AttachFile />} iconPosition="start" />
              <Tab label="Lesson Planner" icon={<Schedule />} iconPosition="start" />
              <Tab label="Engagement Tools" icon={<Feedback />} iconPosition="start" />
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
            Educational Tutor Assistant
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
            <ChatPanel messages={messages} onSendMessage={sendMessage} isLoading={isLoading} error={error} assistantName="Educational Tutor Assistant" enableVoiceInput={true} />
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
          {activeTab === 0 && <PersonalizedTutoringCenter learningPlans={learningPlans} />}
          {activeTab === 1 && <StudentProgressTimeline conversationId={conversationId} client={educationAssistantClient} setError={() => {}} selectedStudent={null} />}
          {activeTab === 2 && <AssessmentManagementSystem conversationId={conversationId} client={educationAssistantClient} setError={() => {}} assessments={assessments} />}
          {activeTab === 3 && <CurriculumPlanningHub conversationId={conversationId} client={educationAssistantClient} setError={() => {}} />}
          {activeTab === 4 && <PerformanceAnalyticsDashboard />}
          {activeTab === 5 && <ResourceOrganizationDashboard />}
          {activeTab === 6 && <StudentEngagementCenter />}
          {activeTab === 7 && <ContentCreationStudio />}
        </Box>
      )}
    </Box>
  );
};

export const EducationalTutorCoachAssistantPage: React.FC<{ clientId: string }> = ({ clientId }) => {
  return (
    <BaseAssistantPage
      title="Educational Tutor Assistant"
      description="Create personalized learning plans, manage student progress, develop curriculum, and enhance educational engagement with comprehensive tutoring tools."
      client={educationAssistantClient}
      initialPrompt="Hello! I need help with educational planning and student management."
      clientId={clientId}
    >
      {(props) => <EducationalTutorCoachAssistantPageView {...props} conversationId={clientId} />}
    </BaseAssistantPage>
  );
};

export default EducationalTutorCoachAssistantPage;
