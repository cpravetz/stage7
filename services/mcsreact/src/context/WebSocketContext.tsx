import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSnackbar } from 'notistack';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { SecurityClient } from '../SecurityClient';
import { MapSerializer } from '../shared-browser';
// Reuse shared types for Mission where possible to keep types consistent across packages
import { Mission as SharedMission, MissionFile as SharedMissionFile } from '@cktmcs/shared';
import { API_BASE_URL, WS_URL } from '../config';

// Local lightweight MissionFile used by the frontend. Prefer the shared MissionFile when available.
export interface LocalMissionFile {
  id: string;
  originalName: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
  uploadedBy: string;
  description?: string;
  isDeliverable?: boolean;
  stepId?: string;
}

// Backwards-compatible export: other modules import { MissionFile } from this context
export type MissionFile = LocalMissionFile;

// Split context into smaller, focused contexts to prevent unnecessary re-renders
interface WebSocketContextType {
  isConnected: boolean;
  clientId: string;
  conversationHistory: string[];
  setConversationHistory: React.Dispatch<React.SetStateAction<string[]>>;
  currentQuestion: { guid: string, sender: string, content: string, choices?: string[], asker: string } | null;
  setCurrentQuestion: React.Dispatch<React.SetStateAction<{ guid: string, sender: string, content: string, choices?: string[], asker: string } | null>>;
  sendMessage: (message: string) => Promise<void>;
  handleControlAction: (action: string) => Promise<void>;
  handleLoadMission: (missionId: string) => Promise<void>;
  listMissions: () => Promise<void>;
  missions: Partial<SharedMission>[];
  pendingUserInput?: {
    request_id: string;
    question: string;
    answerType: string;
    choices?: string[];
  } | null;
  setPendingUserInput?: React.Dispatch<React.SetStateAction<any>>;
}

interface MissionContextType {
  activeMission: boolean;
  activeMissionName: string | null;
  activeMissionId: string | null;
  isPaused: boolean;
  missionStatus: any;
}

interface DataContextType {
  workProducts: { type: 'Interim' | 'Final' | 'Plan', name: string, url: string, workproduct: any, isDeliverable?: boolean }[];
  sharedFiles: LocalMissionFile[];
  statistics: any;
  agentStatistics: Map<string, Array<any>>;
  agentDetails: any[];
}

// Create separate contexts
const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);
const MissionContext = createContext<MissionContextType | undefined>(undefined);
const DataContext = createContext<DataContextType | undefined>(undefined);

// Create a combined provider that manages all state but provides separate contexts
export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [clientId] = useState<string>(() => uuidv4());
  
  // Conversation state
  const [conversationHistory, setConversationHistory] = useState<string[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<{ guid: string, sender: string, content: string, choices?: string[], asker: string } | null>(null);
  
  // Mission state
  const [activeMission, setActiveMission] = useState<boolean>(false);
  const [activeMissionName, setActiveMissionName] = useState<string | null>(null);
  const [activeMissionId, setActiveMissionId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [missionStatus, setMissionStatus] = useState<any>(null);
  const [missions, setMissions] = useState<Partial<SharedMission>[]>([]);
  
  // Data state
  const [workProducts, setWorkProducts] = useState<{ type: 'Interim' | 'Final' | 'Plan', name: string, url: string, workproduct: any, isDeliverable?: boolean }[]>([]);
  const [sharedFiles, setSharedFiles] = useState<LocalMissionFile[]>([]);
  const [agentDetails, setAgentDetails] = useState<any[]>([]);
  const [statistics, setStatistics] = useState<any>({
    llmCalls: 0,
    activeLLMCalls: 0,
    agentCountByStatus: {},
    agentStatistics: new Map(),
    engineerStatistics: { newPlugins: [] }
  });
  const [agentStatistics, setAgentStatistics] = useState<Map<string, Array<any>>>(new Map());

  // User input state
  const [pendingUserInputQueue, setPendingUserInputQueue] = useState<Array<{
    request_id: string;
    question: string;
    answerType: string;
    choices?: string[];
  }>>([]);
  const [pendingUserInput, setPendingUserInput] = useState<{
    request_id: string;
    question: string;
    answerType: string;
    choices?: string[];
  } | null>(null);

  // Add effect to dequeue next user input when current is cleared
  useEffect(() => {
    if (pendingUserInput === null && pendingUserInputQueue.length > 0) {
      const [next, ...rest] = pendingUserInputQueue;
      setPendingUserInput(next);
      setPendingUserInputQueue(rest);
    }
  }, [pendingUserInput, pendingUserInputQueue]);

  const ws = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef<number>(0);
  const { enqueueSnackbar } = useSnackbar();
  const securityClient = SecurityClient.getInstance(API_BASE_URL);

  // Handle WebSocket messages with optimized state updates
  const handleWebSocketMessage = useCallback((data: any) => {
    const MessageType = {
      REQUEST: "request",
      WORK_PRODUCT_UPDATE: "workProductUpdate",
      STATISTICS: "agentStatistics",
      STATUS_UPDATE: "statusUpdate",
      AGENT_UPDATE: "agentUpdate",
      LIST_MISSIONS: "listMissions",
      // Backwards/forwards compatible: backend currently sends 'sharedFilesUpdate' (camelCase)
      // but older frontend code expected 'shared_files_update'. Accept both when handling.
      SHARED_FILES_UPDATE: "sharedFilesUpdate"
    };

    console.log('Processing WebSocket message:', data.type);

    switch (data.type) {
      case 'say':
        setConversationHistory((prev) => {
          // Prevent duplicate messages
          let newMessage = data.content;
          if (typeof newMessage === 'object' && newMessage !== null) {
            newMessage = newMessage.message || JSON.stringify(newMessage);
          }
          const finalMessage = `${newMessage}`;
          if (prev[prev.length - 1] === finalMessage) return prev;
          return [...prev, finalMessage];
        });
        break;
        
      case MessageType.REQUEST:
        setConversationHistory((prev) => [...prev, `${data.sender} asks: ${data.content}`]);
        setCurrentQuestion({ 
          guid: data.content.questionGuid, 
          sender: data.sender, 
          content: data.content.question, 
          choices: data.content.choices, 
          asker: data.content.asker 
        });
        break;
        
      case MessageType.WORK_PRODUCT_UPDATE:
        console.log('[WebSocketContext.tsx] WORK_PRODUCT_UPDATE received:', data.content);
        setWorkProducts(prev => {
          // Check if this work product already exists to prevent duplicates
          const existingIndex = prev.findIndex(wp => 
            wp.name === data.content.name && wp.type === data.content.type
          );
          
          const newProduct = {
            type: data.content.type,
            name: data.content.name,
            url: `${API_BASE_URL}/librarian/retrieve/${data.content.id}`,
            workproduct: data.content.workproduct,
            isDeliverable: data.content.isDeliverable || false
          };
          
          if (existingIndex !== -1) {
            // Update existing
            const updated = [...prev];
            updated[existingIndex] = newProduct;
            return updated;
          } else {
            // Add new
            return [...prev, newProduct];
          }
        });
        // If the backend included attachedFiles with this work product, merge them into the
        // sharedFiles state so the Files tab shows newly created/attached files immediately.
        try {
          const attached = data.content && (data.content.attachedFiles || data.content.attached_files || []);
          if (attached && Array.isArray(attached) && attached.length > 0) {
            setSharedFiles((prev: LocalMissionFile[]) => {
              const map = new Map<string, LocalMissionFile>();
              // seed with existing files
              for (const f of prev) map.set(f.id, f);

              // normalize and upsert attached files
              for (const af of attached) {
                const id = af.id || af.storageId || af.storage_id || uuidv4();
                const normalized: LocalMissionFile = {
                  id,
                  originalName: af.originalName || af.filename || af.name || 'file',
                  size: af.size || af.size_bytes || 0,
                  mimeType: af.mimeType || af.mime_type || 'application/octet-stream',
                  uploadedAt: af.uploadedAt || af.uploaded_at || new Date().toISOString(),
                  uploadedBy: af.uploadedBy || af.uploaded_by || 'system',
                  description: af.description || af.desc || undefined
                };
                map.set(id, normalized);
              }

              const merged = Array.from(map.values());
              if (JSON.stringify(prev) === JSON.stringify(merged)) return prev;
              return merged;
            });
          }
        } catch (e) {
          console.error('Failed to merge attachedFiles from work product update', e);
        }
        break;
        
      case MessageType.STATISTICS:
      case "agentStatistics":
        console.log('AgentStatistics received:', data.content);
        // Batch statistics updates to prevent multiple re-renders
        const batchUpdate = () => {
          let statsToSet = { ...data.content };
          if (statsToSet.agentStatistics && statsToSet.agentStatistics._type === 'Map') {
            statsToSet.agentStatistics = MapSerializer.transformFromSerialization(statsToSet.agentStatistics);
          }
          
          // Only update if data actually changed
          setStatistics((prevStats: any) => {
            const stringified = JSON.stringify(prevStats);
            const newStringified = JSON.stringify(statsToSet);
            return stringified === newStringified ? prevStats : statsToSet;
          });

          if (data.content && data.content.agentStatistics) {
            let processedAgentStats = data.content.agentStatistics;
            if (processedAgentStats._type === 'Map') {
              processedAgentStats = MapSerializer.transformFromSerialization(processedAgentStats);
            }
            
            if (!(processedAgentStats instanceof Map)) {
              try {
                processedAgentStats = new Map(Object.entries(processedAgentStats || {}));
              } catch (e) {
                console.error('WebSocketContext: Failed to convert agentStatistics to Map', e);
                processedAgentStats = new Map();
              }
            }
            
            setAgentStatistics((prevStats: Map<string, Array<any>>) => {
              // Only update if the Map contents actually changed
              if (prevStats.size !== processedAgentStats.size) return processedAgentStats;
              
              for (const [key, value] of processedAgentStats.entries()) {
                if (JSON.stringify(prevStats.get(key)) !== JSON.stringify(value)) {
                  return processedAgentStats;
                }
              }
              
              return prevStats; // No change, return previous
            });
          }
        };
        
        // Debounce statistics updates to prevent rapid re-renders
        clearTimeout((window as any).statsUpdateTimeout);
        (window as any).statsUpdateTimeout = setTimeout(batchUpdate, 50);
        break;
        
      case MessageType.STATUS_UPDATE:
        const statusContent = data.data ? data.data.content : data.content;
        if (statusContent) {
          // Batch mission status updates
          setActiveMission((prev: boolean) => statusContent.active !== prev ? statusContent.active : prev);
          setActiveMissionName((prev: string | null) => statusContent.name !== prev ? statusContent.name : prev);
          setActiveMissionId((prev: string | null) => {
            if (prev !== statusContent.id) {
              localStorage.setItem('missionId', statusContent.id);
            }
            return statusContent.id;
          });
          setMissionStatus((prev: any) => {
            const stringified = JSON.stringify(prev);
            const newStringified = JSON.stringify(statusContent);
            return stringified === newStringified ? prev : statusContent;
          });
        }
        break;
        
      case MessageType.AGENT_UPDATE:
        setAgentDetails((prev) => {
          const index = prev.findIndex((agent) => agent.id === data.content.id);
          if (index !== -1) {
            // Only update if content actually changed
            if (JSON.stringify(prev[index]) === JSON.stringify(data.content)) {
              return prev;
            }
            const newAgents = [...prev];
            newAgents[index] = data.content;
            return newAgents;
          } else {
            return [...prev, data.content];
          }
        });
        break;
        
      case MessageType.SHARED_FILES_UPDATE:
        setSharedFiles((prev: LocalMissionFile[]) => {
          // Backend may send the files either in `content` (current BaseEntity.sendMessage uses `content`)
          // or in `payload` (older code paths). Read both for robustness.
          const newFiles = (data.payload && data.payload.files) || (data.content && data.content.files) || [];
          // Only update if files actually changed
          if (JSON.stringify(prev) === JSON.stringify(newFiles)) return prev;
          return newFiles;
        });
        break;

      // Also accept legacy/alternate snake_case message type just in case
      case 'shared_files_update':
        setSharedFiles((prev: LocalMissionFile[]) => {
          const newFiles = (data.payload && data.payload.files) || (data.content && data.content.files) || [];
          if (JSON.stringify(prev) === JSON.stringify(newFiles)) return prev;
          return newFiles;
        });
        break;
        
      case 'USER_INPUT_REQUEST':
        setPendingUserInputQueue((queue) => [
          ...queue,
          {
            request_id: data.request_id,
            question: data.question,
            answerType: data.answerType,
            choices: data.choices
          }
        ]);
        break;

      case MessageType.LIST_MISSIONS:
        setMissions(data.content.missions);
        break;
        
      default:
        console.log('Unknown message type:', data.type);
    }
  }, [API_BASE_URL]);

  // Memoize context values to prevent unnecessary re-renders
  const webSocketContextValue = useMemo<WebSocketContextType>(() => ({
    isConnected,
    clientId,
    conversationHistory,
    setConversationHistory,
    currentQuestion,
    setCurrentQuestion,
    sendMessage: async (message: string) => {
      if (!clientId) return;
      if (!ws.current) {
        connectWebSocket();
      }
      setConversationHistory((prev: string[]) => [...prev, `User: ${message}`]);

      try {
        const accessToken = securityClient.getAccessToken();
        console.log(`Send message token: ${accessToken ? `${accessToken.substring(0, 10)}...` : 'No token available'}`);

        if (!accessToken) {
          console.error('No authentication token available. Please log in again.');
          setConversationHistory((prev: string[]) => [...prev, 'System: Authentication failed. Please log in again.']);
          return;
        }

        const api = axios.create({
          baseURL: API_BASE_URL,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          withCredentials: true,
        });

        if (!activeMission) {
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
        setConversationHistory((prev: string[]) => [...prev, 'System: Failed to send message. Please try again.']);
      }
    },
    handleControlAction: async (action: string) => {
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
            if (!missionName) return;
            setActiveMissionName(missionName);
          }
          break;
      }

      try {
        const accessToken = securityClient.getAccessToken();
        console.log(`Control action token: ${accessToken ? `${accessToken.substring(0, 10)}...` : 'No token available'}`);

        if (!accessToken) {
          console.error('No authentication token available. Please log in again.');
          setConversationHistory((prev: string[]) => [...prev, 'System: Authentication failed. Please log in again.']);
          return;
        }

        const api = axios.create({
          baseURL: API_BASE_URL,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          withCredentials: true,
        });

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

        setConversationHistory((prev: string[]) => [...prev, `System: Sent ${action} request to MissionControl.`]);

        if (action === 'abort') {
          setActiveMission(false);
          setActiveMissionName(null);
          setActiveMissionId(null);
          localStorage.removeItem('missionId');
        }
      } catch (error) {
        console.error('[WebSocketContext] Failed to send control action:', error instanceof Error ? error.message : error);
        setConversationHistory((prev: string[]) => [...prev, `System: Failed to send ${action} request to MissionControl. Please try again.`]);
      }
    },
    handleLoadMission: async (missionId: string) => {
      try {
        const accessToken = securityClient.getAccessToken();
        console.log(`Load mission token: ${accessToken ? `${accessToken.substring(0, 10)}...` : 'No token available'}`);

        if (!accessToken) {
          console.error('No authentication token available. Please log in again.');
          setConversationHistory((prev: string[]) => [...prev, 'System: Authentication failed. Please log in again.']);
          return;
        }

        const api = axios.create({
          baseURL: API_BASE_URL,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          withCredentials: true,
        });

        console.log(`[WebSocketContext] Loading mission ${missionId}`);
        await api.post('/loadMission', {
          missionId,
          clientId
        }, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        setConversationHistory((prev: string[]) => [...prev, `System: Mission ${missionId} loaded.`]);
      } catch (error) {
        console.error('[WebSocketContext] Failed to load mission:', error instanceof Error ? error.message : error);
        setConversationHistory((prev: string[]) => [...prev, 'System: Failed to load mission. Please try again.']);
      }
    },
    listMissions: async () => {
      if (!ws.current) {
        connectWebSocket();
      }
      ws.current?.send(JSON.stringify({
        type: 'LIST_MISSIONS',
        sender: 'user',
        recipient: 'MissionControl',
        clientId
      }));
    },
    missions,
    pendingUserInput,
    setPendingUserInput: (value) => {
      if (value === null) {
        setPendingUserInput(null);
        setPendingUserInputQueue((queue: any[]) => {
          if (queue.length === 0) return [];
          const [next, ...rest] = queue;
          setPendingUserInput(next);
          return rest;
        });
      } else {
        setPendingUserInput(value);
      }
    }
  }), [isConnected, clientId, conversationHistory, currentQuestion, pendingUserInput, activeMission, activeMissionName, activeMissionId, missions]);

  const missionContextValue = useMemo<MissionContextType>(() => ({
    activeMission,
    activeMissionName,
    activeMissionId,
    isPaused,
    missionStatus
  }), [activeMission, activeMissionName, activeMissionId, isPaused, missionStatus]);

  const dataContextValue = useMemo<DataContextType>(() => ({
    workProducts,
    sharedFiles,
    statistics,
    agentStatistics,
    agentDetails
  }), [workProducts, sharedFiles, statistics, agentStatistics, agentDetails]);

  // Connection logic
  const connectWebSocket = useCallback(() => {
    if (isConnecting) {
      console.log('Already attempting to connect, ignoring duplicate request');
      return;
    }

    if (ws.current && (ws.current.readyState === WebSocket.CONNECTING ||
                       ws.current.readyState === WebSocket.OPEN)) {
      console.log('WebSocket already connecting or connected');
      return;
    }

    setIsConnecting(true);
    console.log('Connecting to WebSocket');

    const token = securityClient.getAccessToken();
    console.log('Token for WebSocket connection:', token ? `${token.substring(0, 10)}...` : 'No token available');

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

      const storedMissionId = localStorage.getItem('missionId');
      if (storedMissionId) {
        ws.current?.send(JSON.stringify({
          type: 'RECONNECT_MISSION',
          content: {
            missionId: storedMissionId
          }
        }));
      }
    };

    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

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

      if (event.code !== 1000 && event.code !== 1001) {
        enqueueSnackbar('Disconnected from server. Attempting to reconnect...', { variant: 'warning' });
        const reconnectDelay = Math.min(5000 * Math.pow(1.5, reconnectAttempts.current), 30000);
        reconnectAttempts.current++;
        console.log(`Scheduling reconnect in ${reconnectDelay}ms (attempt #${reconnectAttempts.current})`);
        setTimeout(connectWebSocket, reconnectDelay);
      } else {
        console.log('Connection closed normally, not reconnecting');
      }
    };
  }, [clientId, enqueueSnackbar, handleWebSocketMessage]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      // Don't close WebSocket on unmount to maintain connection across routes
    };
  }, [connectWebSocket]);

  return (
    <WebSocketContext.Provider value={webSocketContextValue}>
      <MissionContext.Provider value={missionContextValue}>
        <DataContext.Provider value={dataContextValue}>
          {children}
        </DataContext.Provider>
      </MissionContext.Provider>
    </WebSocketContext.Provider>
  );
};

// Export individual hooks for specific contexts
export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

export const useMission = () => {
  const context = useContext(MissionContext);
  if (context === undefined) {
    throw new Error('useMission must be used within a WebSocketProvider');
  }
  return context;
};

export const useData = () => {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a WebSocketProvider');
  }
  return context;
};