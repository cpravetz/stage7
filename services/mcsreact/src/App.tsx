import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { Box, Button, Container, Paper, Typography, Drawer, AppBar, Toolbar, IconButton, Select, MenuItem, FormControl, InputLabel, SelectChangeEvent } from '@mui/material/index.js';
import React, { useState, useEffect, useRef } from 'react';
import { Menu as MenuIcon, Close as CloseIcon } from '@mui/icons-material';
import TabbedPanel from './components/TabbedPanel';
import TextInput from './components/TextInput';
import MissionControls from './components/MissionControls';
import StatisticsWindow from './components/StatisticsWindow';
import SavedMissionsList from './components/SavedMissionsList';
import MissionList from './components/MissionList';
import ErrorBoundary from './components/ErrorBoundary';
import LoginComponent from './components/Login';
import EmailVerification from './components/EmailVerification';
import PasswordReset from './components/PasswordReset';
import RequestPasswordReset from './components/RequestPasswordReset';
import ModelPerformanceDashboard from './components/ModelPerformanceDashboard';
import PluginManager from './components/PluginManager';
import AppLayout from './components/AppLayout';
import ContentCreatorAssistant from './assistants/ContentCreatorAssistant/ContentCreatorAssistant';
import CustomerSupportAgent from './assistants/CustomerSupportAgent/CustomerSupportAgent';
import EducationalTutorAssistant from './assistants/EducationalTutorAssistant/EducationalTutorAssistant';
import EventPlannerAssistant from './assistants/EventPlannerAssistant/EventPlannerAssistant';
import ExecutiveCoachAssistant from './assistants/ExecutiveCoachAssistant/ExecutiveCoachAssistant';
import FinancialAnalystAssistant from './assistants/FinancialAnalystAssistant/FinancialAnalystAssistant';
import HealthcarePatientCoordinatorAssistant from './assistants/HealthcarePatientCoordinatorAssistant/HealthcarePatientCoordinatorAssistant';
import HotelOperationsAssistant from './assistants/HotelOperationsAssistant/HotelOperationsAssistant';
import HRRecruitmentAssistant from './assistants/HRRecruitmentAssistant/HRRecruitmentAssistant';
import InvestmentAdvisorAssistant from './assistants/InvestmentAdvisorAssistant/InvestmentAdvisorAssistant';
import MarketingCampaignManager from './assistants/MarketingCampaignManager/MarketingCampaignManager';
import PmAssistantPage from './assistants/ProductManagerAssistant/PmAssistantPage';
import RestaurantOperationsAssistant from './assistants/RestaurantOperationsAssistant/RestaurantOperationsAssistant';
import SalesCRMAssistant from './assistants/SalesCRMAssistant/SalesCRMAssistant';
import ScriptwriterAssistant from './assistants/ScriptwriterAssistant/ScriptwriterAssistant';
import SongwriterAssistant from './assistants/SongwriterAssistant/SongwriterAssistant';
import SportsWagerAdvisorAssistant from './assistants/SportsWagerAdvisorAssistant/SportsWagerAdvisorAssistant';
import CareerAssistant from './assistants/CareerAssistant/CareerAssistant';
import LegalAdvisorAssistantPage from './assistants/LegalAdvisorAssistant/LegalAdvisorAssistantPage';
import PerformanceAnalyticsPage from './assistants/PerformanceAnalyticsAssistant/PerformanceAnalyticsPage';
import CTOAssistant from './assistants/CTOAssistant';
import { ThemeToggle } from './components/ThemeToggle';
import { AppThemeProvider } from './theme/AppThemeProvider';

import { SecurityClient } from './SecurityClient';
import { useSnackbar } from 'notistack';
import { useWebSocket, useMission, useData } from './context/WebSocketContext';
import { useAuth } from './context/AuthContext';
import { API_BASE_URL } from './config';
import './App.css';
import { AnswerType } from './shared-browser'; // Import AnswerType and ConversationMessage
import { ActiveQuestion } from './components/TextInput'; // Import ActiveQuestion

const MainApp: React.FC<{ clientId: string }> = ({ clientId }) => {
  const { isAuthenticated, login, logout } = useAuth();
  const [showSavedMissions, setShowSavedMissions] = useState<boolean>(false);
  const [showMissionList, setShowMissionList] = useState<boolean>(false);
  const [activeQuestion, setActiveQuestion] = useState<ActiveQuestion | null>(null); // New state for active question
  const securityClient = SecurityClient.getInstance(API_BASE_URL);
  const [selectedAssistant, setSelectedAssistant] = useState('');

  const assistants = [
    { path: '/pm-assistant', name: 'PM Assistant', component: <PmAssistantPage clientId={clientId} /> },
    { path: '/hotel-ops-assistant', name: 'Hotel Operations Assistant', component: <HotelOperationsAssistant clientId={clientId} /> },
    { path: '/restaurant-ops-assistant', name: 'Restaurant Operations Assistant', component: <RestaurantOperationsAssistant clientId={clientId} /> },
    { path: '/marketing-campaign-manager', name: 'Marketing Campaign Manager', component: <MarketingCampaignManager clientId={clientId} /> },
    { path: '/sales-crm-assistant', name: 'Sales CRM Assistant', component: <SalesCRMAssistant clientId={clientId} /> },
    { path: '/scriptwriter-assistant', name: 'Scriptwriter Assistant', component: <ScriptwriterAssistant clientId={clientId} /> },
    { path: '/songwriter-assistant', name: 'Songwriter Assistant', component: <SongwriterAssistant clientId={clientId} /> },
    { path: '/sports-wager-advisor-assistant', name: 'Sports Wager Advisor', component: <SportsWagerAdvisorAssistant clientId={clientId} /> },
    { path: '/content-creator-assistant', name: 'Content Creator Assistant', component: <ContentCreatorAssistant clientId={clientId} /> },
    { path: '/customer-support-agent', name: 'Customer Support Agent', component: <CustomerSupportAgent clientId={clientId} /> },
    { path: '/educational-tutor-assistant', name: 'Educational Tutor Assistant', component: <EducationalTutorAssistant clientId={clientId} /> },
    { path: '/event-planner-assistant', name: 'Event Planner Assistant', component: <EventPlannerAssistant clientId={clientId} /> },
    { path: '/executive-coach-assistant', name: 'Executive Coach Assistant', component: <ExecutiveCoachAssistant clientId={clientId} /> },
    { path: '/financial-analyst-assistant', name: 'Financial Analyst Assistant', component: <FinancialAnalystAssistant clientId={clientId} /> },
    { path: '/healthcare-patient-coordinator-assistant', name: 'Healthcare Patient Coordinator', component: <HealthcarePatientCoordinatorAssistant clientId={clientId} /> },
    { path: '/hr-recruitment-assistant', name: 'HR Recruitment Assistant', component: <HRRecruitmentAssistant clientId={clientId} /> },
    { path: '/investment-advisor-assistant', name: 'Investment Advisor Assistant', component: <InvestmentAdvisorAssistant clientId={clientId} /> },
    { path: '/career-assistant', name: 'Career Assistant', component: <CareerAssistant clientId={clientId} /> },
    { path: '/cto-assistant', name: 'CTO Assistant', component: <CTOAssistant clientId={clientId} /> },
    { path: '/legal-advisor-assistant', name: 'Legal Advisor Assistant', component: <LegalAdvisorAssistantPage clientId={clientId} /> },
    { path: '/performance-analytics', name: 'Performance Analytics Assistant', component: <PerformanceAnalyticsPage clientId={clientId} /> },
  ];

  // Use the split contexts for shared state across routes
  const {
    conversationHistory,
    sendMessage: contextSendMessage,
    handleControlAction: contextHandleControlAction,
    handleLoadMission: contextHandleLoadMission,
    listMissions,
    missions,
    pendingUserInput,
    setPendingUserInput
  } = useWebSocket();

  const {
    activeMission,
    activeMissionName,
    activeMissionId,
    isPaused
  } = useMission();

  const {
    workProducts,
    sharedFiles,
    statistics,
    agentStatistics
  } = useData();

  // Responsive layout state
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const { enqueueSnackbar } = useSnackbar();

  const ws = useRef<WebSocket | null>(null);

  // Effect to update activeQuestion when pendingUserInput changes
  
  useEffect(() => {
    if (pendingUserInput) {
      setActiveQuestion({
        requestId: pendingUserInput.request_id,
        question: getQuestionContent(pendingUserInput.question),
        choices: pendingUserInput.choices,
        answerType: pendingUserInput.answerType as AnswerType,
      });
    } else {
      setActiveQuestion(null);
    }
  }, [pendingUserInput]);
  
  const handleLogin = async (email: string, password: string) => {
    try {
        await login(email, password);
        enqueueSnackbar('Login successful', { variant: 'success' });
        window.location.href = '/';
    } catch (error) {
        console.error('Login failed:', error instanceof Error ? error.message : error);
        enqueueSnackbar(`Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`, { variant: 'error' });
    }
  };

  const handleRegister = async (name: string, email: string, password: string) => {
    try {
        await securityClient.register({name, email, password});
        // After registration, we should be authenticated
        // The AuthContext will handle token management
        enqueueSnackbar('Registration successful', { variant: 'success' });
        // Redirect to home page after successful registration
        window.location.href = '/';
    } catch (error) {
        console.error('Registration failed:', error instanceof Error ? error.message : error);
        enqueueSnackbar(`Registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`, { variant: 'error' });
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      // The AuthContext will handle token management
      if (ws.current) {
        ws.current.close();
        ws.current = null;
      }
      enqueueSnackbar('Logged out successfully', { variant: 'success' });
      window.location.href = '/';
    } catch (error) {
      console.error('Logout failed:', error instanceof Error ? error.message : error);
      enqueueSnackbar(`Logout failed: ${error instanceof Error ? error.message : 'Unknown error'}`, { variant: 'error' });
    }
  };

  const getQuestionContent = (question: any): string => {
    if (typeof question === 'object' && question !== null && 'value' in question) {
      return question.value;
    }
    return String(question); // Ensure it's always a string
  };

  const handleSendMessage = async (message: string) => {
    await contextSendMessage(message);
  };

  const handleAnswer = async (requestId: string, answer: string) => {
    // The WebSocketContext should handle adding the question to history when pendingUserInput is set.
    // We just need to send the answer and clear the pending state.
    await contextSendMessage(answer);
    if (setPendingUserInput) setPendingUserInput(null);
    setActiveQuestion(null);
  };

  const handleCancelQuestion = () => {
    if (setPendingUserInput) setPendingUserInput(null);
    setActiveQuestion(null);
    // Optionally, send a cancellation message to the server
    // contextSendMessage("User cancelled the question.");
  };

  // Use the handleControlAction function from WebSocketContext
  const handleControlAction = async (action: string) => {
    // Special case for 'load' action to show saved missions
    if (action === 'load') {
      setShowSavedMissions(true);
      return;
    }

    if (action === 'list_missions') {
      await listMissions();
      setShowMissionList(true);
      return;
    }

    // For all other actions, use the context function
    await contextHandleControlAction(action);
  };

  // Use the handleLoadMission function from WebSocketContext
  const handleLoadMission = async (missionId: string) => {
    await contextHandleLoadMission(missionId);
    setShowSavedMissions(false);
    setShowMissionList(false);
  };

  if (!isAuthenticated) {
    return <LoginComponent onLogin={handleLogin} onRegister={handleRegister} />;
  }

  return (
    <ErrorBoundary>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
        <AppBar position="static" color="primary" elevation={1}>
          <Toolbar>
            <IconButton
              edge="start"
              color="inherit"
              aria-label="menu"
              sx={{ mr: 2, display: { sm: 'none' } }}
              onClick={() => setDrawerOpen(true)}
            >
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              Stage7
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Button
                color="inherit"
                component={Link}
                to="/model-performance"
                sx={{ mr: 2 }}
              >
                Model Performance
              </Button>
              <Button
                color="inherit"
                component={Link}
                to="/plugins"
                sx={{ mr: 2 }}
              >
                Tools and Plugins
              </Button>
              <FormControl sx={{ mr: 1, minWidth: 220 }} size="small">
                <InputLabel id="assistant-select-label" sx={{ color: 'white' }}>Select Assistant</InputLabel>
                <Select
                  labelId="assistant-select-label"
                  id="assistant-select"
                  value={selectedAssistant}
                  label="Select Assistant"
                  onChange={(e: SelectChangeEvent) => setSelectedAssistant(e.target.value)}
                  sx={{
                    color: 'white',
                    '.MuiOutlinedInput-notchedOutline': {
                      borderColor: 'rgba(255, 255, 255, 0.7)',
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'white',
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'white',
                    },
                    '.MuiSvgIcon-root': {
                      color: 'white',
                    },
                  }}
                >
                  {assistants.map((assistant) => (
                    <MenuItem key={assistant.path} value={assistant.path}>
                      {assistant.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button
                color="inherit"
                component={Link}
                to={selectedAssistant}
                disabled={!selectedAssistant}
                variant="outlined"
                sx={{ 
                  mr: 2,
                  borderColor: 'rgba(255, 255, 255, 0.7)',
                  '&:hover': {
                    borderColor: 'white',
                  }
                }}
              >
                Go
              </Button>
              <ThemeToggle />
              <IconButton color="inherit" onClick={handleLogout} aria-label="logout">
                <Typography variant="body2" sx={{ mr: 1 }}>
                  Logout
                </Typography>
              </IconButton>
            </Box>
          </Toolbar>
        </AppBar>

        {/* Mobile drawer */}
        <Drawer
          anchor="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          sx={{ display: { sm: 'none' } }}
        >
          <Box sx={{ width: 250, p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Menu</Typography>
              <IconButton onClick={() => setDrawerOpen(false)}>
                <CloseIcon />
              </IconButton>
            </Box>
            {!showSavedMissions ? (
              <StatisticsWindow
                statistics={statistics}
                activeMissionName={activeMissionName}
                activeMission={activeMission}
              />
            ) : (
              <SavedMissionsList
                onMissionSelect={handleLoadMission}
                onClose={() => setShowSavedMissions(false)}
              />
            )}
          </Box>
        </Drawer>

        {/* Main content */}
        <Box sx={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
          <Box sx={{
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column',
            p: 2,
            overflow: 'hidden'
          }}>
            <Paper
              elevation={2}
              sx={{
                flexGrow: 1,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                mb: 2
              }}
            >
              <TabbedPanel
                conversationHistory={conversationHistory}
                workProducts={workProducts}
                // The new `sharedFiles` state from the context is passed down.
                // This will be received by FileUpload to render the file list.
                sharedFiles={sharedFiles}
                agentStatistics={agentStatistics}
                activeMissionId={activeMissionId || undefined}
              />
            </Paper>
            <TextInput
              onSend={handleSendMessage}
              activeQuestion={activeQuestion}
              onAnswer={handleAnswer}
              onCancelQuestion={handleCancelQuestion}
            />
            <Box sx={{ mt: 2 }}>
              <MissionControls
                onControl={handleControlAction}
                activeMission={activeMission}
                missionName={activeMissionName}
                activeMissionId={activeMissionId}
                isPaused={isPaused}
              />
            </Box>
          </Box>

          {/* Side panel - hidden on mobile */}
          <Box
            sx={{
              width: 300,
              p: 2,
              display: { xs: 'none', sm: 'block' },
              bgcolor: 'background.paper',
              borderLeft: 1,
              borderColor: 'divider'
            }}
          >
            {showMissionList ? (
              <MissionList
                missions={missions}
                onMissionSelect={handleLoadMission}
                onClose={() => setShowMissionList(false)}
              />
            ) : !showSavedMissions ? (
              <StatisticsWindow
                statistics={statistics}
                activeMissionName={activeMissionName}
                activeMission={activeMission}
              />
            ) : (
              <SavedMissionsList
                onMissionSelect={handleLoadMission}
                onClose={() => setShowSavedMissions(false)}
              />
            )}
          </Box>
        </Box>
      </Box>
    </ErrorBoundary>
  );
};


const App: React.FC = () => {
  const { clientId } = useWebSocket(); // Get clientId from context
  return (
    <AppThemeProvider>
      <Router>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<MainApp clientId={clientId} />} />
            <Route path="/verify-email" element={<EmailVerification />} />
            <Route path="/reset-password" element={<PasswordReset />} />
            <Route path="/forgot-password" element={<RequestPasswordReset />} />
            <Route path="/model-performance" element={<ModelPerformanceDashboard />} />
            <Route path="/plugins" element={<PluginManager />} />
            <Route path="/pm-assistant" element={<PmAssistantPage clientId={clientId} />} />
            <Route path="/hotel-ops-assistant" element={<HotelOperationsAssistant clientId={clientId} />} />
            <Route path="/restaurant-ops-assistant" element={<RestaurantOperationsAssistant clientId={clientId} />} />
            <Route path="/marketing-campaign-manager" element={<MarketingCampaignManager clientId={clientId} />} />
            <Route path="/sales-crm-assistant" element={<SalesCRMAssistant clientId={clientId} />} />
            <Route path="/scriptwriter-assistant" element={<ScriptwriterAssistant clientId={clientId} />} />
            <Route path="/songwriter-assistant" element={<SongwriterAssistant clientId={clientId} />} />
            <Route path="/sports-wager-advisor-assistant" element={<SportsWagerAdvisorAssistant clientId={clientId} />} />
            <Route path="/content-creator-assistant" element={<ContentCreatorAssistant clientId={clientId} />} />
            <Route path="/customer-support-agent" element={<CustomerSupportAgent clientId={clientId} />} />
            <Route path="/educational-tutor-assistant" element={<EducationalTutorAssistant clientId={clientId} />} />
            <Route path="/event-planner-assistant" element={<EventPlannerAssistant clientId={clientId} />} />
            <Route path="/executive-coach-assistant" element={<ExecutiveCoachAssistant clientId={clientId} />} />
            <Route path="/financial-analyst-assistant" element={<FinancialAnalystAssistant clientId={clientId} />} />
            <Route path="/healthcare-patient-coordinator-assistant" element={<HealthcarePatientCoordinatorAssistant clientId={clientId} />} />
            <Route path="/hr-recruitment-assistant" element={<HRRecruitmentAssistant clientId={clientId} />} />
            <Route path="/investment-advisor-assistant" element={<InvestmentAdvisorAssistant clientId={clientId} />} />
            <Route path="/career-assistant" element={<CareerAssistant clientId={clientId} />} />
            <Route path="/cto-assistant" element={<CTOAssistant clientId={clientId} />} />
            <Route path="/legal-advisor-assistant" element={<LegalAdvisorAssistantPage clientId={clientId} />} />
            <Route path="/performance-analytics" element={<PerformanceAnalyticsPage clientId={clientId} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Router>
    </AppThemeProvider>
  );
};

export default App;