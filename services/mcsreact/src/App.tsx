import React, { useState, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { Box, Button, Container, Paper, Typography, Drawer, AppBar, Toolbar, IconButton } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import UserInputModal from './components/UserInputModal';
import { AnswerType } from './components/UserInputModal';
import TabbedPanel from './components/TabbedPanel';
import TextInput from './components/TextInput';
import MissionControls from './components/MissionControls';
import StatisticsWindow from './components/StatisticsWindow';
import SavedMissionsList from './components/SavedMissionsList';
import ErrorBoundary from './components/ErrorBoundary';
import LoginComponent from './components/Login';
import EmailVerification from './components/EmailVerification';
import PasswordReset from './components/PasswordReset';
import RequestPasswordReset from './components/RequestPasswordReset';
import ModelPerformanceDashboard from './components/ModelPerformanceDashboard';
import PluginManager from './components/PluginManager';
import { ThemeToggle } from './components/ThemeToggle';
import { AppThemeProvider } from './theme/AppThemeProvider';

import { SecurityClient } from './SecurityClient';
import { useSnackbar } from 'notistack';
import { useWebSocket } from './context/WebSocketContext';
import { useAuth } from './context/AuthContext';
import { API_BASE_URL } from './config';
import './App.css';

const MainApp: React.FC = () => {
  const { isAuthenticated, login, logout } = useAuth();
  const [showSavedMissions, setShowSavedMissions] = useState<boolean>(false);
  const securityClient = SecurityClient.getInstance(API_BASE_URL);

  // Use the WebSocketContext for shared state across routes
  const {
    conversationHistory,
    activeMission,
    activeMissionName,
    activeMissionId,
    isPaused,
    workProducts,
    statistics,
    agentStatistics,
    sendMessage: contextSendMessage,
    handleControlAction: contextHandleControlAction,
    handleLoadMission: contextHandleLoadMission,
    pendingUserInput,
    setPendingUserInput
  } = useWebSocket();

  // Responsive layout state
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const { enqueueSnackbar } = useSnackbar();

  const ws = useRef<WebSocket | null>(null);


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

  // Handler for submitting user input from modal
  const handleUserInputSubmit = async (requestId: string, response: any) => {
    try {
      await fetch('http://localhost:5020/submitUserInput', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, response })
      });
      if (setPendingUserInput) setPendingUserInput(null);
    } catch (error) {
      console.error('Failed to submit user input:', error);
    }
  };

  // Use the sendMessage function from WebSocketContext
  const handleSendMessage = async (message: string) => {
    await contextSendMessage(message);
  };

  // Use the handleControlAction function from WebSocketContext
  const handleControlAction = async (action: string) => {
    // Special case for 'load' action to show saved missions
    if (action === 'load') {
      setShowSavedMissions(true);
      return;
    }

    // For all other actions, use the context function
    await contextHandleControlAction(action);
  };

  // Use the handleLoadMission function from WebSocketContext
  const handleLoadMission = async (missionId: string) => {
    await contextHandleLoadMission(missionId);
    setShowSavedMissions(false);
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
                to="/github-plugins"
                sx={{ mr: 2 }}
              >
                Tools and Plugins
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
                agentStatistics={agentStatistics}
                activeMissionId={activeMissionId || undefined}
              />
            </Paper>
            <TextInput onSend={handleSendMessage} />
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
        </Box>

        {/* User Input Modal */}
        {pendingUserInput && (
          <UserInputModal
            requestId={pendingUserInput.request_id}
            question={pendingUserInput.question}
            choices={pendingUserInput.choices}
            answerType={pendingUserInput.answerType as AnswerType}
            onSubmit={handleUserInputSubmit}
            onClose={() => {if (setPendingUserInput) setPendingUserInput(null)}}
          />
        )}
      </Box>
    </ErrorBoundary>
  );
};

// Import the AppLayout component
import AppLayout from './components/AppLayout';

const App: React.FC = () => {
  return (
    <AppThemeProvider>
      <Router>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<MainApp />} />
            <Route path="/verify-email" element={<EmailVerification />} />
            <Route path="/reset-password" element={<PasswordReset />} />
            <Route path="/forgot-password" element={<RequestPasswordReset />} />
            <Route path="/model-performance" element={<ModelPerformanceDashboard />} />
            <Route path="/github-plugins" element={<PluginManager />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Router>
    </AppThemeProvider>
  );
};

export default App;