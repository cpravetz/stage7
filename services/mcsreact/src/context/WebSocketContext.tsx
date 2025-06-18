import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useSnackbar } from 'notistack';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { SecurityClient } from '../SecurityClient';
import { MapSerializer } from '../shared-browser';
import { API_BASE_URL, WS_URL } from '../config';

// Define the context type
interface WebSocketContextType {
  isConnected: boolean;
  clientId: string;
  conversationHistory: string[];
  setConversationHistory: React.Dispatch<React.SetStateAction<string[]>>;
  currentQuestion: { guid: string, sender: string, content: string, choices?: string[], asker: string } | null;
  setCurrentQuestion: React.Dispatch<React.SetStateAction<{ guid: string, sender: string, content: string, choices?: string[], asker: string } | null>>;
  activeMission: boolean;
  activeMissionName: string | null;
  activeMissionId: string | null;
  isPaused: boolean;
  workProducts: { type: 'Interim' | 'Final', name: string, url: string }[];
  agentDetails: any[];
  missionStatus: any;
  statistics: any;
  agentStatistics: Map<string, Array<any>>;
  sendMessage: (message: string) => Promise<void>;
  handleControlAction: (action: string) => Promise<void>;
  handleLoadMission: (missionId: string) => Promise<void>;
}

// Create the context with default values
const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

// Create a provider component
export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [clientId] = useState<string>(() => uuidv4());
  const [conversationHistory, setConversationHistory] = useState<string[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<{ guid: string, sender: string, content: string, choices?: string[], asker: string } | null>(null);
  const [activeMission, setActiveMission] = useState<boolean>(false);
  const [activeMissionName, setActiveMissionName] = useState<string | null>(null);
  const [activeMissionId, setActiveMissionId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [workProducts, setWorkProducts] = useState<{ type: 'Interim' | 'Final', name: string, url: string }[]>([]);
  const [agentDetails, setAgentDetails] = useState<any[]>([]);
  const [missionStatus, setMissionStatus] = useState<any>(null);
  const [statistics, setStatistics] = useState<any>({
    llmCalls: 0,
    agentCountByStatus: {},
    agentStatistics: new Map(),
    engineerStatistics: { newPlugins: [] }
  });
  const [agentStatistics, setAgentStatistics] = useState<Map<string, Array<any>>>(new Map());

  const ws = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef<number>(0);
  const { enqueueSnackbar } = useSnackbar();
  const securityClient = SecurityClient.getInstance(API_BASE_URL);

  // Handle WebSocket messages
  const handleWebSocketMessage = useCallback((data: any) => {
    const MessageType = {
      REQUEST: "request",
      WORK_PRODUCT_UPDATE: "workProductUpdate",
      STATISTICS: "agentStatistics",
      STATUS_UPDATE: "statusUpdate",
      AGENT_UPDATE: "agentUpdate"
    };

    console.log('Processing WebSocket message:', data.type);
    console.log('Message content:', data);

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
      case "agentStatistics": // Handle both enum value and string literal
        console.log('WebSocketContext: Received raw statistics content:', JSON.stringify(data.content, null, 2));
        // Log the raw agentStatistics part specifically
        if (data.content && data.content.agentStatistics) {
          console.log('WebSocketContext: Received raw data.content.agentStatistics:', JSON.stringify(data.content.agentStatistics, null, 2));
        }

        setStatistics(data.content); // This updates the broader statistics object

        if (data.content && data.content.agentStatistics) {
          let processedAgentStats = data.content.agentStatistics;
          if (processedAgentStats._type === 'Map') {
            processedAgentStats = MapSerializer.transformFromSerialization(processedAgentStats);
          }
          // Ensure processedAgentStats is a Map before setting
          if (!(processedAgentStats instanceof Map)) {
            console.warn('WebSocketContext: Processed agentStatistics is not a Map, attempting to convert from object:', processedAgentStats);
            try {
              // Attempt to convert if it's an object that was previously a Map
              processedAgentStats = new Map(Object.entries(processedAgentStats || {}));
            } catch (e) {
              console.error('WebSocketContext: Failed to convert agentStatistics to Map, defaulting to empty Map.', e);
              processedAgentStats = new Map();
            }
          }
          setAgentStatistics(processedAgentStats);
        } else {
          // If agentStatistics is not present in the message, maybe clear it or set to default
          setAgentStatistics(new Map());
        }
        break;
      case MessageType.STATUS_UPDATE:
        console.log('Received mission status update:', data.data ? data.data.content : data.content);
        // Handle both formats (data.data.content and data.content)
        const statusContent = data.data ? data.data.content : data.content;
        if (statusContent) {
          setActiveMission(statusContent.active);
          setActiveMissionName(statusContent.name);
          setActiveMissionId(statusContent.id);
          setMissionStatus(statusContent);
        }
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
  }, [API_BASE_URL]);

  // Connect to WebSocket
  const connectWebSocket = useCallback(() => {
    // Prevent multiple connection attempts
    if (isConnecting) {
      console.log('Already attempting to connect, ignoring duplicate request');
      return;
    }

    // Prevent reconnection if already connected
    if (ws.current && (ws.current.readyState === WebSocket.CONNECTING ||
                       ws.current.readyState === WebSocket.OPEN)) {
      console.log('WebSocket already connecting or connected');
      return;
    }

    setIsConnecting(true);
    console.log('Connecting to WebSocket');

    // Get authentication token
    const token = securityClient.getAccessToken();
    console.log('Token for WebSocket connection:', token ? `${token.substring(0, 10)}...` : 'No token available');

    // Create WebSocket connection with token if available
    const wsUrl = token
      ? `${WS_URL}?clientId=${clientId}&token=${token}`
      : `${WS_URL}?clientId=${clientId}`;
    console.log('WebSocket connection URL:', wsUrl.replace(token || '', token ? '(token)' : ''));

    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      setIsConnecting(false);
      console.log('WebSocket connection established with PostOffice');
      reconnectAttempts.current = 0;
      setIsConnected(true);
      enqueueSnackbar('Connected to server', { variant: 'success' });
      ws.current?.send(JSON.stringify({
        type: 'CLIENT_CONNECT',
        clientId: clientId
      }));
    };

    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Received WebSocket message:', data);

        // Log the full message for debugging
        console.log('Full message data:', JSON.stringify(data, null, 2));

        if (data.type === 'CONNECTION_CONFIRMED') {
          console.log('Connection confirmed by server');
        } else {
          handleWebSocketMessage(data);
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
        console.log('Raw message data:', event.data);
      }
    };

    ws.current.onerror = (error) => {
      setIsConnecting(false);
      console.error('WebSocket error:', error);
      setIsConnected(false);
      enqueueSnackbar('Connection error. Please try again.', { variant: 'error' });
    };

    ws.current.onclose = (event) => {
      setIsConnecting(false);
      console.log('WebSocket connection closed with code:', event.code, 'reason:', event.reason);
      setIsConnected(false);

      // Don't attempt to reconnect if the connection was closed normally or if component is unmounting
      if (event.code !== 1000 && event.code !== 1001) {
        enqueueSnackbar('Disconnected from server. Attempting to reconnect...', { variant: 'warning' });
        // Add increasing backoff to prevent rapid reconnection loops
        const reconnectDelay = Math.min(5000 * Math.pow(1.5, reconnectAttempts.current), 30000);
        reconnectAttempts.current++;
        console.log(`Scheduling reconnect in ${reconnectDelay}ms (attempt #${reconnectAttempts.current})`);
        setTimeout(connectWebSocket, reconnectDelay);
      } else {
        console.log('Connection closed normally, not reconnecting');
      }
    };
  }, [clientId, enqueueSnackbar, handleWebSocketMessage]);

  // Connect to WebSocket on mount and maintain connection across route changes
  useEffect(() => {
    connectWebSocket();

    // Don't close the WebSocket connection when the component unmounts
    // This allows the connection to persist when navigating between routes
    return () => {
      // We intentionally don't close the WebSocket here to maintain the connection
      // across route changes. The connection will be closed when the app is closed.
    };
  }, [connectWebSocket]);

  // Log agentStatistics when it updates
  useEffect(() => {
    // Check if agentStatistics is not empty or in its initial state before logging,
    // to avoid logging on initial mount if it's empty.
    if (agentStatistics && agentStatistics.size > 0) {
      console.log('WebSocketContext: agentStatistics state updated:', JSON.stringify(MapSerializer.transformForSerialization(agentStatistics), null, 2));
    } else if (agentStatistics) { // Log even if it's an empty map after an update
      console.log('WebSocketContext: agentStatistics state updated to an empty Map.');
    }
  }, [agentStatistics]);

  // Create API instance
  const createAPI = () => {
    return axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      withCredentials: true,
    });
  };

  const api = createAPI();

  // Send message function
  const sendMessage = async (message: string) => {
    if (!clientId) return;
    if (!ws.current) {
      connectWebSocket();
    }
    setConversationHistory((prev) => [...prev, `User: ${message}`]);

    try {
      // Get authentication token
      const accessToken = securityClient.getAccessToken();
      console.log(`Send message token: ${accessToken ? `${accessToken.substring(0, 10)}...` : 'No token available'}`);

      // Check if we have a token
      if (!accessToken) {
        console.error('No authentication token available. Please log in again.');
        setConversationHistory((prev) => [...prev, 'System: Authentication failed. Please log in again.']);
        return;
      }

      if (!activeMission) {
        // Include the auth token in the createMission request
        console.log(`[WebSocketContext] Creating new mission with token: ${accessToken.substring(0, 10)}...`);
        await api.post('/createMission', {
          goal: message,
          clientId
        }, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        setActiveMission(true);
        console.log('[WebSocketContext] New mission created successfully');
      } else {
        // Include the auth token in all requests
        const headers = {
          'Authorization': `Bearer ${accessToken}`
        };

        if (currentQuestion) {
          console.log(`[WebSocketContext] Sending answer to question from ${currentQuestion.asker}`);
          await api.post('/sendMessage', {
            type: "answer",
            sender: 'user',
            content: { missionId: activeMissionId, answer: message, asker: currentQuestion.asker, questionGuid: currentQuestion.guid },
            recipient: 'missionControl',
            clientId
          }, { headers });
          setCurrentQuestion(null);
        } else {
          console.log(`[WebSocketContext] Sending user message to active mission ${activeMissionId}`);
          await api.post('/sendMessage', {
            type: "userMessage",
            sender: 'user',
            recipient: 'MissionControl',
            content: { missionId: activeMissionId, message: message},
            clientId
          }, { headers });
        }
      }
    } catch (error) {
      console.error('[WebSocketContext] Failed to send message:', error instanceof Error ? error.message : error);
      setConversationHistory((prev) => [...prev, 'System: Failed to send message. Please try again.']);
    }
  };

  // Handle control actions
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
      case 'save':
        if (!activeMissionName) {
          missionName = prompt('Please enter a name for the mission:');
          if (!missionName) return; // User cancelled the prompt
          setActiveMissionName(missionName);
        }
        break;
    }

    try {
      // Get authentication token
      const accessToken = securityClient.getAccessToken();
      console.log(`Control action token: ${accessToken ? `${accessToken.substring(0, 10)}...` : 'No token available'}`);

      // Check if we have a token
      if (!accessToken) {
        console.error('No authentication token available. Please log in again.');
        setConversationHistory((prev) => [...prev, 'System: Authentication failed. Please log in again.']);
        return;
      }

      console.log(`[WebSocketContext] Sending ${action} control action to MissionControl`);
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
      }, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      setConversationHistory((prev) => [...prev, `System: Sent ${action} request to MissionControl.`]);

      if (action === 'abort') {
        setActiveMission(false);
        setActiveMissionName(null);
        setActiveMissionId(null);
      }
    } catch (error) {
      console.error('[WebSocketContext] Failed to send control action:', error instanceof Error ? error.message : error);
      setConversationHistory((prev) => [...prev, `System: Failed to send ${action} request to MissionControl. Please try again.`]);
    }
  };

  // Handle load mission
  const handleLoadMission = async (missionId: string) => {
    try {
      // Get authentication token
      const accessToken = securityClient.getAccessToken();
      console.log(`Load mission token: ${accessToken ? `${accessToken.substring(0, 10)}...` : 'No token available'}`);

      // Check if we have a token
      if (!accessToken) {
        console.error('No authentication token available. Please log in again.');
        setConversationHistory((prev) => [...prev, 'System: Authentication failed. Please log in again.']);
        return;
      }

      console.log(`[WebSocketContext] Loading mission ${missionId}`);
      await api.post('/loadMission', {
        missionId,
        clientId
      }, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      setConversationHistory((prev) => [...prev, `System: Mission ${missionId} loaded.`]);
    } catch (error) {
      console.error('[WebSocketContext] Failed to load mission:', error instanceof Error ? error.message : error);
      setConversationHistory((prev) => [...prev, 'System: Failed to load mission. Please try again.']);
    }
  };

  // Provide the context value
  const contextValue: WebSocketContextType = {
    isConnected,
    clientId,
    conversationHistory,
    setConversationHistory,
    currentQuestion,
    setCurrentQuestion,
    activeMission,
    activeMissionName,
    activeMissionId,
    isPaused,
    workProducts,
    agentDetails,
    missionStatus,
    statistics,
    agentStatistics,
    sendMessage,
    handleControlAction,
    handleLoadMission
  };

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
};

// Create a hook to use the WebSocket context
export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};





