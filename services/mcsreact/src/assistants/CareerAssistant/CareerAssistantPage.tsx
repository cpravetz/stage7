import React, { useState, useCallback } from 'react';
import { BaseAssistantPage } from '../shared/BaseAssistantPage';
import { careerAssistantClient } from '../shared/assistantClients';
import { IconButton, Tabs, Tab, Box, Typography, useTheme, useMediaQuery } from '@mui/material';
import { Menu as MenuIcon, Close as CloseIcon } from '@mui/icons-material';
import { ConversationMessage } from '@cktmcs/sdk'; // Keep ConversationMessage for type definitions

import PersonalizedJobMatching from './components/PersonalizedJobMatching';
import ResumeOptimization from './components/ResumeOptimization';
import ApplicationTracking from './components/ApplicationTracking';
import InterviewPreparation from './components/InterviewPreparation';
import SalaryNegotiation from './components/SalaryNegotiation';
import CareerDevelopment from './components/CareerDevelopment';
import { ChatPanel } from '../../assistants/shared/components/ChatPanel'; // Import StandardAssistantChat

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


// Helper component for tab panels
interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`career-assistant-tabpanel-${index}`}
      aria-labelledby={`career-assistant-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `career-assistant-tab-${index}`,
    'aria-controls': `career-assistant-tabpanel-${index}`,
  };
}


const CareerAssistantPage: React.FC<{ clientId: string }> = ({ clientId }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const toggleLeftPanel = () => setLeftPanelOpen(!leftPanelOpen);
  const toggleRightPanel = () => setRightPanelOpen(!rightPanelOpen);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };


  return (
    <BaseAssistantPage
      title="Career Assistant"
      description="Your AI partner for job search and career development."
      client={careerAssistantClient}
      initialPrompt="Hello! I need help with my job search and career development."
      clientId={clientId}
    >
      {({ messages, sendMessage, isLoading, error, humanInputRequired, submitHumanInput }) => {

        // --- Data Extraction from Messages ---
        const extractLatestToolOutput = useCallback(<T,>(toolName: string): T | null => {
          const relevantMessages = messages.filter(
            (msg) => msg.sender === 'tool' && (msg.content as any)?.tool === toolName
          );
          if (relevantMessages.length > 0) {
            return (relevantMessages[relevantMessages.length - 1].content as any) as T;
          }
          return null;
        }, [messages]);

        const careerProfileData = extractLatestToolOutput<{ careerProfile: CareerProfile }>('CareerProfileTool')?.careerProfile || null;
        const jobListingsData = extractLatestToolOutput<{ jobListings: JobListing[] }>('JobMatchingTool')?.jobListings || [];
        const applicationData = extractLatestToolOutput<{ applications: Application[] }>('ApplicationTrackingTool')?.applications || [];
        const interviewData = extractLatestToolOutput<{ interviewSessions: InterviewSession[] }>('InterviewPreparationTool')?.interviewSessions || [];
        const salaryNegotiationData = extractLatestToolOutput<{ jobOfferDetails: JobOfferDetails, marketAnalysis: MarketAnalysis, negotiationStrategy: NegotiationStrategy }>('SalaryNegotiationTool');
        const careerDevelopmentData = extractLatestToolOutput<{ developmentPlans: CareerDevelopmentPlan[] }>('CareerDevelopmentTool')?.developmentPlans || [];
        const resumeOptimizationData = extractLatestToolOutput<{ currentResume: string, targetJobDescription: string, optimizedResumeContent: string, optimizationSuggestions: string[] }>('ResumeOptimizationTool');


        // --- Action Handlers ---
        const handleApply = (jobId: string) => {
          sendMessage(`Apply for job with ID: ${jobId}`);
        };
        const handleUpdateProfile = () => {
          sendMessage('Update my career profile.');
        };
        const handleUploadResume = () => {
          sendMessage('Upload my resume.');
        };
        const handleSetTargetJob = () => {
          sendMessage('Set a new target job description.');
        };
        const handleOptimize = () => {
          sendMessage('Optimize my resume and application based on my target job.');
        };
        const handleApproveResume = () => {
          sendMessage('Approve the optimized resume.');
        };
        const handleAddApplication = () => {
          sendMessage('Add a new job application.');
        };
        const handleUpdateApplicationStatus = (appId: string, newStatus: Application['status']) => {
          sendMessage(`Update application ${appId} status to ${newStatus}.`);
        };
        const handleScheduleInterview = () => {
          sendMessage('Schedule a new interview preparation session.');
        };
        const handleReviewFeedback = (sessionId: string) => {
          sendMessage(`Review feedback for interview session ${sessionId}.`);
        };
        const handleConductMockInterview = (sessionId: string) => {
          sendMessage(`Conduct a mock interview for session ${sessionId}.`);
        };
        const handleReceiveOffer = () => {
          sendMessage('Enter new job offer details.');
        };
        const handleAnalyzeOffer = () => {
          sendMessage('Analyze my current job offer.');
        };
        const handleDevelopStrategy = () => {
          sendMessage('Develop a salary negotiation strategy.');
        };
        const handleAddDevelopmentPlan = () => {
          sendMessage('Create a new career development plan.');
        };
        const handleUpdateDevelopmentPlanStatus = (planId: string, newStatus: CareerDevelopmentPlan['status']) => {
          sendMessage(`Update development plan ${planId} status to ${newStatus}.`);
        };
        const handleViewResources = (planId: string) => {
          sendMessage(`View resources for development plan ${planId}.`);
        };


        return (
          <Box sx={{
            display: 'flex',
            height: '100%',
            width: '100%'
          }}>
            {/* Left Panel - Career Tools */}
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
                    Career Tools
                  </Typography>

                  <Tabs
                    value={activeTab}
                    onChange={handleTabChange}
                    orientation="vertical"
                    variant="scrollable"
                    sx={{ borderRight: 1, borderColor: 'divider' }}
                    aria-label="career assistant features tabs"
                  >
                    <Tab label="Job Matching" {...a11yProps(0)} />
                    <Tab label="Resume & App Optimization" {...a11yProps(1)} />
                    <Tab label="Application Tracking" {...a11yProps(2)} />
                    <Tab label="Interview Prep" {...a11yProps(3)} />
                    <Tab label="Salary Negotiation" {...a11yProps(4)} />
                    <Tab label="Career Development" {...a11yProps(5)} />
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
                  Career Assistant
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
              <ChatPanel
                messages={messages}
                onSendMessage={sendMessage}
                isLoading={isLoading}
                error={error}
                assistantName="Career Assistant"
                enableVoiceInput={true}
              />
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
                {activeTab === 0 && <PersonalizedJobMatching
                  careerProfile={careerProfileData}
                  jobListings={jobListingsData}
                  onApply={handleApply}
                  onUpdateProfile={handleUpdateProfile}
                />}
                {activeTab === 1 && <ResumeOptimization
                  currentResume={resumeOptimizationData?.currentResume || null}
                  targetJobDescription={resumeOptimizationData?.targetJobDescription || null}
                  optimizedResumeContent={resumeOptimizationData?.optimizedResumeContent || null}
                  optimizationSuggestions={resumeOptimizationData?.optimizationSuggestions || []}
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
                  jobOfferDetails={salaryNegotiationData?.jobOfferDetails || null}
                  marketAnalysis={salaryNegotiationData?.marketAnalysis || null}
                  negotiationStrategy={salaryNegotiationData?.negotiationStrategy?.talkingPoints || null}
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
      }}
    </BaseAssistantPage>
  );
};

export default CareerAssistantPage;

