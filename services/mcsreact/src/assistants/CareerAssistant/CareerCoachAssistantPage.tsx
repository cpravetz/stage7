import React, { useEffect, useCallback, useMemo } from 'react';
import { BaseAssistantPage } from '../shared/BaseAssistantPage';
import { careerAssistantClient } from '../shared/assistantClients';
import { ConversationMessage } from '@cktmcs/sdk';
import { Box, Typography, useTheme, useMediaQuery, Tabs, Tab, IconButton } from '@mui/material';
import { Menu as MenuIcon, Close as CloseIcon } from '@mui/icons-material';

// Import existing components
import PersonalizedJobMatching from './components/PersonalizedJobMatching';
import ResumeOptimization from './components/ResumeOptimization';
import ApplicationTracking from './components/ApplicationTracking';
import InterviewPreparation from './components/InterviewPreparation';
import SalaryNegotiation from './components/SalaryNegotiation';
import CareerDevelopment from './components/CareerDevelopment';
import {
  CareerProfile,
  JobListing,
  Application,
  InterviewSession,
  JobOfferDetails,
  MarketAnalysis,
  NegotiationStrategy,
  CareerDevelopmentPlan
} from './types';
import { ChatPanel } from '../../assistants/shared/components/ChatPanel';

interface AssistantRenderProps {
    conversationId: string;
    messages: ConversationMessage[];
    sendMessage: (message: string) => Promise<void>;
    sendEvent: (event: any) => Promise<void>;
    isLoading: boolean;
    error: string | null;
    humanInputRequired: { prompt: string; type: string; metadata: any; inputStepId: string; } | null;
    submitHumanInput: (response: string, inputStepId: string) => void;
    assistantState: any;
    getState: (collectionName: string) => any[];
    mergeAssistantState: (collection: string, items: any[]) => void;
}

const CareerCoachAssistantPageView: React.FC<AssistantRenderProps> = ({ 
    conversationId, messages, sendMessage, sendEvent, isLoading, error, humanInputRequired, 
    submitHumanInput, assistantState, getState 
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
      entityId: entityId || 'career-' + Date.now()
    }), [conversationId]);

    const careerProfileData = useMemo(() => assistantState.careerProfile?.[Object.keys(assistantState.careerProfile || {})[0]] || null, [assistantState]);
    const jobListingsData = useMemo(() => Object.values(assistantState.jobListing || {}).map((v: any) => v), [assistantState]);
    const applicationData = useMemo(() => Object.values(assistantState.application || {}).map((v: any) => v), [assistantState]);
    const interviewData = useMemo(() => Object.values(assistantState.interviewSession || {}).map((v: any) => v), [assistantState]);
    const negotiationData = useMemo(() => assistantState.negotiationData?.[Object.keys(assistantState.negotiationData || {})[0]] || { jobOfferDetails: null, marketAnalysis: null, negotiationStrategy: null }, [assistantState]);
    const careerDevelopmentData = useMemo(() => Object.values(assistantState.developmentPlan || {}).map((v: any) => v), [assistantState]);
    const resumeOptimizationData = useMemo(() => assistantState.resumeOptimization?.[Object.keys(assistantState.resumeOptimization || {})[0]] || { currentResume: null, targetJobDescription: null, optimizedResumeContent: null, optimizationSuggestions: [] }, [assistantState]);

    const handleApply = useCallback((jobId: string) => {
        sendEvent(buildEvent('domain.application.create', { jobId, status: 'applied' }, jobId));
    }, [sendEvent, buildEvent]);

    const handleUpdateProfile = useCallback(() => {
        sendEvent(buildEvent('domain.careerProfile.update', careerProfileData || {}));
    }, [sendEvent, buildEvent, careerProfileData]);

    const handleUploadResume = useCallback(() => {
        sendEvent(buildEvent('domain.resumeOptimization.create', resumeOptimizationData || {}));
    }, [sendEvent, buildEvent, resumeOptimizationData]);

    const handleSetTargetJob = useCallback(() => {
        sendEvent(buildEvent('domain.resumeOptimization.update', { targetJobDescription: resumeOptimizationData?.targetJobDescription }));
    }, [sendEvent, buildEvent, resumeOptimizationData]);

    const handleOptimize = useCallback(() => {
        sendEvent(buildEvent('domain.resumeOptimization.optimize', { targetRole: resumeOptimizationData?.targetJobDescription }));
    }, [sendEvent, buildEvent, resumeOptimizationData]);

    const handleApproveResume = useCallback(() => {
        sendEvent(buildEvent('domain.resumeOptimization.approve', { optimizedContent: resumeOptimizationData?.optimizedResumeContent }));
    }, [sendEvent, buildEvent, resumeOptimizationData]);

    const handleAddApplication = useCallback(() => {
        sendEvent(buildEvent('domain.application.create', { status: 'new' }));
    }, [sendEvent, buildEvent]);

    const handleUpdateApplicationStatus = useCallback((appId: string, newStatus: Application['status']) => {
        sendEvent(buildEvent('domain.application.update', { status: newStatus }, appId));
    }, [sendEvent, buildEvent]);

    const handleScheduleInterview = useCallback(() => {
        sendEvent(buildEvent('domain.interviewSession.create', { status: 'scheduled' }));
    }, [sendEvent, buildEvent]);

    const handleReviewFeedback = useCallback((sessionId: string) => {
        sendEvent(buildEvent('domain.interviewSession.update', { status: 'reviewed' }, sessionId));
    }, [sendEvent, buildEvent]);

    const handleConductMockInterview = useCallback((sessionId: string) => {
        sendEvent(buildEvent('domain.interviewSession.mock', { sessionId }));
    }, [sendEvent, buildEvent]);

    const handleReceiveOffer = useCallback(() => {
        sendEvent(buildEvent('domain.negotiationData.receive', {}));
    }, [sendEvent, buildEvent]);

    const handleAnalyzeOffer = useCallback(() => {
        sendEvent(buildEvent('domain.negotiationData.analyze', negotiationData));
    }, [sendEvent, buildEvent, negotiationData]);

    const handleDevelopStrategy = useCallback(() => {
        sendEvent(buildEvent('domain.negotiationData.strategy', {}));
    }, [sendEvent, buildEvent]);

    const handleAddDevelopmentPlan = useCallback(() => {
        sendEvent(buildEvent('domain.developmentPlan.create', { status: 'active' }));
    }, [sendEvent, buildEvent]);

    const handleUpdateDevelopmentPlanStatus = useCallback((planId: string, newStatus: CareerDevelopmentPlan['status']) => {
        sendEvent(buildEvent('domain.developmentPlan.update', { status: newStatus }, planId));
    }, [sendEvent, buildEvent]);

    const handleViewResources = useCallback((planId: string) => {
        sendEvent(buildEvent('domain.developmentPlan.resources', {}, planId));
    }, [sendEvent, buildEvent]);

    return (
        <Box sx={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
            {/* Left Panel - Career Tools */}
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
                    Career Tools
                  </Typography>

                  <Tabs
                    value={activeTab}
                    onChange={(e, newValue) => setActiveTab(newValue)}
                    orientation="vertical"
                    variant="scrollable"
                    sx={{ borderRight: 1, borderColor: 'divider' }}
                  >
                    <Tab label="Job Matching" />
                    <Tab label="Resume & App Optimization" />
                    <Tab label="Application Tracking" />
                    <Tab label="Interview Prep" />
                    <Tab label="Salary Negotiation" />
                    <Tab label="Career Development" />
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
                  Career Coach Assistant
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
                <ChatPanel messages={messages} onSendMessage={sendMessage} isLoading={isLoading} error={error} assistantName="Career Coach Assistant" enableVoiceInput={true} />
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
                {activeTab === 0 && <PersonalizedJobMatching
                  careerProfile={careerProfileData}
                  jobListings={jobListingsData}
                  onApply={handleApply}
                  onUpdateProfile={handleUpdateProfile}
                />}
                {activeTab === 1 && <ResumeOptimization
                  currentResume={resumeOptimizationData?.currentResume}
                  targetJobDescription={resumeOptimizationData?.targetJobDescription}
                  optimizedResumeContent={resumeOptimizationData?.optimizedResumeContent}
                  optimizationSuggestions={resumeOptimizationData?.optimizationSuggestions}
                  onUploadResume={handleUploadResume}
                  onSetTargetJob={handleSetTargetJob}
                  onOptimize={handleOptimize}
                  onApprove={handleApproveResume}
                />}
                {activeTab === 2 && <ApplicationTracking
                  applications={applicationData}
                  onUpdateStatus={handleUpdateApplicationStatus}
                  onAddApplication={handleAddApplication}
                />}
                {activeTab === 3 && <InterviewPreparation
                  upcomingInterviews={interviewData}
                  onScheduleInterview={handleScheduleInterview}
                  onReviewFeedback={handleReviewFeedback}
                  onConductMockInterview={handleConductMockInterview}
                />}
                {activeTab === 4 && <SalaryNegotiation
                  jobOfferDetails={negotiationData?.jobOfferDetails}
                  marketAnalysis={negotiationData?.marketAnalysis}
                  negotiationStrategy={negotiationData?.negotiationStrategy}
                  onReceiveOffer={handleReceiveOffer}
                  onAnalyzeOffer={handleAnalyzeOffer}
                  onDevelopStrategy={handleDevelopStrategy}
                />}
                {activeTab === 5 && <CareerDevelopment
                  developmentPlans={careerDevelopmentData}
                  onAddPlan={handleAddDevelopmentPlan}
                  onUpdatePlanStatus={handleUpdateDevelopmentPlanStatus}
                  onViewResources={handleViewResources}
                />}
              </Box>
            )}
          </Box>
    );
};

export const CareerCoachAssistantPage: React.FC<{ clientId: string }> = ({ clientId }) => {
  return (
    <BaseAssistantPage
      title="Career Coach Assistant"
      description="Get comprehensive career coaching, job search assistance, resume optimization, interview preparation, and career development planning."
      client={careerAssistantClient}
      initialPrompt="Hello! I need help with my job search and career development."
      clientId={clientId}
    >
      {(props) => <CareerCoachAssistantPageView {...props} />}
    </BaseAssistantPage>
  );
};

export default CareerCoachAssistantPage;
