import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Box, Container, Paper, Typography, useTheme as useMuiTheme, Drawer, AppBar, Toolbar, IconButton } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import UserInputModal from './components/UserInputModal';
import TabbedPanel from './components/TabbedPanel';
import TextInput from './components/TextInput';
import MissionControls from './components/MissionControls';
import StatisticsWindow from './components/StatisticsWindow';
import SavedMissionsList from './components/SavedMissionsList';
import ErrorBoundary from './components/ErrorBoundary';
import LoginComponent from './components/Login';
import { ThemeToggle } from './components/ThemeToggle';
import { AppThemeProvider } from './theme/AppThemeProvider';
import { useTheme } from './theme/ThemeContext';
import { AgentStatistics, MissionStatistics, MessageType, MapSerializer } from './shared-browser';
import { SecurityClient } from './SecurityClient';
import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { useSnackbar } from 'notistack';
import './App.css';

const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:5020`;
const WS_URL = `ws://${window.location.hostname}:5020`;

interface WorkProduct {
  type: 'Interim' | 'Final';
  name: string;
  url: string;
}

const AppContent: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const securityClient = useMemo(() => new SecurityClient(API_BASE_URL), []);
  const [conversationHistory, setConversationHistory] = useState<string[]>([]);
  const [userInputRequest, setUserInputRequest] = useState<any>(null);
  const [clientId] = useState<string>(() => uuidv4()); // Generate clientId once and store it
  const [activeMission, setActiveMission] = useState<boolean>(false);
  const [activeMissionName, setActiveMissionName] = useState<string | null>(null);
  const [activeMissionId, setActiveMissionId] = useState<string | null>(null);
  const [showSavedMissions, setShowSavedMissions] = useState<boolean>(false);
  const [currentQuestion, setCurrentQuestion] = useState<{ guid: string, sender: string, content: string, choices?: string[], asker: string } | null>(null);
  const [agentDetails, setAgentDetails] = useState<any[]>([]);
  const [missionStatus, setMissionStatus] = useState<any>(null);
  const [workProducts, setWorkProducts] = useState<WorkProduct[]>([]);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [statistics, setStatistics] = useState<MissionStatistics>({
    llmCalls: 0,
    agentCountByStatus: {},
    agentStatistics: new Map(),
    engineerStatistics: { newPlugins: [] }
  });

  const [agentStatistics, setAgentStatistics] = useState<Map<string, Array<AgentStatistics>>>(new Map());

  // Responsive layout state
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const muiTheme = useMuiTheme();
  const { mode } = useTheme();
  const { enqueueSnackbar } = useSnackbar();

  const ws = useRef<WebSocket | null>(null);

  const createAPI = useCallback((getToken: () => string | null): AxiosInstance => {
    const api = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      withCredentials: true,
    });

    api.interceptors.request.use(async (config) => {
      let token = securityClient.getAccessToken();
      if (!token) {
        try {
          token = await securityClient.refreshAccessToken();
          if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
          } else {
            // Redirect to login page or handle authentication failure
            setIsAuthenticated(false);
            resetToken(null);
          }
        } catch (error) {
          console.error('Error refreshing token:', error);
          // Redirect to login page or handle authentication failure
          setIsAuthenticated(false);
          resetToken(null);
        }
      } else {
        config.headers['Authorization'] = `Bearer ${token}`;
      }
      return config;
    }, (error) => {
      return Promise.reject(error);
    });

    return api;
  }, [securityClient]);


  const resetToken = (newToken: string | null) => {
    if (newToken === null) {
      localStorage.removeItem('accessToken');
    } else {
      localStorage.setItem('accessToken', newToken);
    }
    setToken(newToken);
  }

  const api = useMemo(() => createAPI(() => localStorage.getItem('accessToken')), [createAPI]);

  const handleWebSocketMessage = useCallback((data: any) => {
    console.log('Processing WebSocket message:', data);

    switch (data.type) {
        case 'say':
            setConversationHistory((prev) => [...prev, `${data.sender}: ${data.content}`]);
            break;
        case MessageType.REQUEST:
            setConversationHistory((prev) => [...prev, `${data.sender} asks: ${data.content}`]);
            setCurrentQuestion({ guid: data.content.questionGuid, sender: data.sender, content: data.content.question, choices: data.content.choices, asker: data.content.asker });
            break;
        case MessageType.WORK_PRODUCT_UPDATE:
            setWorkProducts(prev => [...prev, {
                type: data.content.type,
                name: data.content.name,
                url: `${API_BASE_URL}/librarian/retrieve/${data.content.id}`
            }]);
            break;
        case MessageType.STATISTICS:
            setStatistics(data.content);
            if (data.content.agentStatistics) {
              if( data.content.agentStatistics._type === 'Map') {
                data.content.agentStatistics = MapSerializer.transformFromSerialization(data.content.agentStatistics);
              }
              setAgentStatistics(data.content.agentStatistics);
            }
            break;
        case MessageType.STATUS_UPDATE :
            console.log('Received mission status update:', data.data.content);
            setActiveMission(data.data.content.active);
            setActiveMissionName(data.data.content.name);
            setActiveMissionId(data.data.content.id);
            setMissionStatus(data.data.content);
            break;
        case MessageType.AGENT_UPDATE:
            setAgentDetails((prev) => {
                const index = prev.findIndex((agent) => agent.id === data.content.id);
                if (index !== -1) {
                    const newAgents = [...prev];
                    newAgents[index] = data.content;
                    return newAgents;
                } else {
                    return [...prev, data.content];
                }
            });
            break;
        default:
            console.log('Unknown message type:', data.type);
    }
  }, []);


  useEffect(() => {
    // Check for existing token in localStorage
    const savedToken = securityClient.getAccessToken();
    if (savedToken) {
        setToken(savedToken);
        setIsAuthenticated(true);
        connectWebSocket();
    }
}, []);

const handleLogin = async (email: string, password: string) => {
  try {
      await securityClient.login(email, password);
      setToken(securityClient.getAccessToken()!);
      setIsAuthenticated(true);
      connectWebSocket();
      enqueueSnackbar('Login successful', { variant: 'success' });
  } catch (error) {
      console.error('Login failed:', error instanceof Error ? error.message : error);
      enqueueSnackbar(`Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`, { variant: 'error' });
  }
};

const handleRegister = async (name: string, email: string, password: string) => {
  try {
      await securityClient.register(name, email, password);
      const newToken = securityClient.getAccessToken();
      if (newToken) {
          setToken(newToken);
          setIsAuthenticated(true);
          connectWebSocket();
          enqueueSnackbar('Registration successful', { variant: 'success' });
      } else {
          throw new Error('Registration successful but no token received');
      }
  } catch (error) {
      console.error('Registration failed:', error instanceof Error ? error.message : error);
      enqueueSnackbar(`Registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`, { variant: 'error' });
  }
};

const handleLogout = async () => {
  try {
    securityClient.logout();
    setIsAuthenticated(false);
    resetToken(null);
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
    enqueueSnackbar('Logged out successfully', { variant: 'success' });
  } catch (error) {
    console.error('Logout failed:', error instanceof Error ? error.message : error);
    enqueueSnackbar(`Logout failed: ${error instanceof Error ? error.message : 'Unknown error'}`, { variant: 'error' });
  }
};

const connectWebSocket = () => {
  console.log('Connecting to WebSocket');
  const accessToken = securityClient.getAccessToken();
  console.log(`Access token: ${accessToken}`);
  if (!isAuthenticated || !clientId || !accessToken || (accessToken === null)) {
    return;
  }
  console.log(`Connecting to WebSocket with clientId: ${clientId}, accessToken: ${accessToken}`);
  // Include the token in the WebSocket connection URL
  const wsUrl = `${WS_URL}?clientId=${clientId}&token=${accessToken}`;
  ws.current = new WebSocket(wsUrl);
  console.log('WebSocket connection URL:', wsUrl);

  ws.current.onopen = () => {
    console.log('WebSocket connection established with PostOffice');
    enqueueSnackbar('Connected to server', { variant: 'success' });
    ws.current?.send(JSON.stringify({
      type: 'CLIENT_CONNECT',
      clientId: clientId
    }));
  };

  ws.current.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('Received WebSocket message:', data);
    if (data.type === 'CONNECTION_CONFIRMED') {
      console.log('Connection confirmed by server');
    } else {
      handleWebSocketMessage(data);
    }
  };

  ws.current.onerror = (error) => {
    console.error('WebSocket error:', error);
    enqueueSnackbar('Connection error. Please try again.', { variant: 'error' });
  };

  ws.current.onclose = () => {
    console.log('WebSocket connection closed. Attempting to reconnect...');
    enqueueSnackbar('Disconnected from server. Attempting to reconnect...', { variant: 'warning' });
    setTimeout(connectWebSocket, 5000);
  };
};

useEffect(() => {
  const accessToken = securityClient.getAccessToken();


  connectWebSocket(); // Connect to WebSocket on mount

  return () => {
    if (ws.current) {
      ws.current.close();
    }
  };
}, [handleWebSocketMessage]);

  const handleSendMessage = async (message: string) => {
    if (!clientId) return;
    if (!ws.current) {
      connectWebSocket();
    }
    setConversationHistory((prev) => [...prev, `User: ${message}`]);

    try {
      if (!activeMission) {
        // Include the auth token in the createMission request
        const accessToken = securityClient.getAccessToken();
        console.log(`Create mission token: ${accessToken}`);
        await api.post('/createMission', {
          goal: message,
          clientId
        }, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        setActiveMission(true);
        console.log('New mission created');
      } else {
            if (currentQuestion) {
          await api.post('/sendMessage', {
            type: MessageType.ANSWER,
            sender: 'user',
            content: { missionId: activeMissionId, answer: message, asker: currentQuestion.asker, questionGuid: currentQuestion.guid },
            recipient: 'missionControl',
            clientId
          });
          setCurrentQuestion(null);
        } else {
          await api.post('/sendMessage', {
            type: MessageType.USER_MESSAGE,
            sender: 'user',
            recipient: 'MissionControl',
            content: { missionId: activeMissionId, message: message},
            clientId
          });
        }
      }
    } catch (error) {
      console.error('Failed to send message:', error instanceof Error ? error.message : error);
      setConversationHistory((prev) => [...prev, 'System: Failed to send message. Please try again.']);
    }
  };

  const handleControlAction = async (action: string) => {
    if (!clientId) return;

    let missionName = activeMissionName;
    switch (action) {
      case 'pause':
        setIsPaused(true);
        break;
      case 'resume':
        setIsPaused(false);
        break;
      case 'load':
        setShowSavedMissions(true);
        return;
      case 'save':
        if (!activeMissionName) {
          missionName = prompt('Please enter a name for the mission:');
          if (!missionName) return; // User cancelled the prompt
          setActiveMissionName(missionName);
        }
        break;
    }

    try {
      await api.post('/sendMessage', {
        clientId,
        recipient: 'MissionControl',
        content: {
          type: action,
          action: action,
          missionId: activeMissionId,
          missionName: missionName
        },
        timestamp: new Date().toISOString()
      });

      setConversationHistory((prev) => [...prev, `System: Sent ${action} request to MissionControl.`]);

      if (action === 'abort') {
        setActiveMission(false);
        setActiveMissionName(null);
        setActiveMissionId(null);
      }
    } catch (error) {
      console.error('Failed to send control action:', error instanceof Error ? error.message : error);
      setConversationHistory((prev) => [...prev, `System: Failed to send ${action} request to MissionControl. Please try again.`]);
    }
  };

  const handleLoadMission = async (missionId: string) => {
    try {
      await api.post('/loadMission', { missionId });
      setConversationHistory((prev) => [...prev, `System: Mission ${missionId} loaded.`]);
      setShowSavedMissions(false);
    } catch (error) {
      console.error('Failed to load mission:', error instanceof Error ? error.message : error);
      setConversationHistory((prev) => [...prev, 'System: Failed to load mission. Please try again.']);
    }
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
            <ThemeToggle />
            <IconButton color="inherit" onClick={handleLogout} aria-label="logout">
              <Typography variant="body2" sx={{ mr: 1 }}>
                Logout
              </Typography>
            </IconButton>
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
      </Box>
    </ErrorBoundary>
  );
};

const App: React.FC = () => {
  return (
    <AppThemeProvider>
      <AppContent />
    </AppThemeProvider>
  );
};

export default App;