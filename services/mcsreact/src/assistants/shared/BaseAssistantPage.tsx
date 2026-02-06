// Base Assistant Page Component - Template for all assistants
// This provides the core conversation functionality that all assistants share
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Typography, Button, Box, CircularProgress } from '@mui/material/index.js';
import { ConversationMessage } from '@cktmcs/sdk';
import { AssistantClient } from './AssistantClient';
import { ChatPanel } from './components/ChatPanel';
import { useWebSocket } from '../../context/WebSocketContext'; // Import useWebSocket


interface PendingUserInput {
  request_id: string;
  question: string;
  answerType: string;
  choices?: string[];
  missionId?: string;
  inputStepId?: string;
}

interface BaseAssistantPageProps {
  title: string;
  description: string;
  client: AssistantClient;
  initialPrompt?: string;
  clientId: string;
  children?: (props: {
    conversationId: string;
    messages: ConversationMessage[];
    sendMessage: (message: string) => Promise<void>;
    sendEvent: (event: any) => Promise<void>;
    assistantState: any;
    getState: (collectionName: string) => any[];
    mergeAssistantState: (collection: string, items: any[]) => void;
    isLoading: boolean;
    error: string | null;
    humanInputRequired: { prompt: string; type: string; metadata: any; inputStepId: string } | null;
    submitHumanInput: (response: string, inputStepId: string) => Promise<void>;
    clientId: string;
  }) => React.ReactNode;
}

export const BaseAssistantPage: React.FC<BaseAssistantPageProps> = ({
  title,
  description,
  client,
  initialPrompt = 'Hello! I need assistance.',
  clientId, // Destructure clientId here
  children // Destructure children here
}) => {
  const {
    conversationHistory: globalConversationHistory, // Use global conversation history
    setConversationHistory: setGlobalConversationHistory, // Use global setter
    assistantStateByConversation,
    setAssistantStateByConversation,
    sendMessage: sendGlobalMessage, // Use global sendMessage
    pendingUserInput: globalPendingUserInput,
    setPendingUserInput: setGlobalPendingUserInput, // Use global setter
    switchAssistant,
    saveAssistantConversation
  } = useWebSocket();

  const [conversationId, setConversationId] = useState<string | null>(null);
  // REMOVED: const [messages, setMessages] = useState<ConversationMessage[]>([]); // Messages will come from global context
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // REMOVED: const [humanInputRequired, setHumanInputRequired] = useState<any>(null); // Use global pendingUserInput

  const visibleMessages = useMemo(() => {
    // Only filter out system messages (mission control, internal status, etc.)
    // Keep all agent and user messages
    return globalConversationHistory.filter((msg) => msg.sender !== 'system');
  }, [globalConversationHistory]);

  const assistantState = useMemo(() => {
    if (!conversationId) return {};
    return assistantStateByConversation[conversationId] || {};
  }, [assistantStateByConversation, conversationId]);

  const mergeAssistantState = useCallback((collection: string, items: any[]) => {
    if (!conversationId) return;
    setAssistantStateByConversation((prev) => {
      const prevConversation = prev[conversationId] || {};
      const prevCollection = prevConversation[collection] || {};
      const nextCollection = { ...prevCollection };

      items.forEach((item) => {
        if (!item || !item.id) return;
        nextCollection[item.id] = item;
      });

      return {
        ...prev,
        [conversationId]: {
          ...prevConversation,
          [collection]: nextCollection
        }
      };
    });
  }, [conversationId, setAssistantStateByConversation]);

  const applyStateDelta = useCallback((delta: any) => {
    if (!conversationId || !delta) return;
    setAssistantStateByConversation((prev) => {
      const prevConversation = prev[conversationId] || {};
      const prevCollection = prevConversation[delta.collection] || {};
      let nextCollection = prevCollection;

      if (delta.operation === 'delete') {
        const { [delta.entityId]: _, ...rest } = prevCollection;
        nextCollection = rest;
      } else {
        const entityId = delta.entityId || delta.data?.id;
        if (!entityId) return prev;
        nextCollection = {
          ...prevCollection,
          [entityId]: delta.data
        };
      }

      return {
        ...prev,
        [conversationId]: {
          ...prevConversation,
          [delta.collection]: nextCollection
        }
      };
    });
  }, [conversationId, setAssistantStateByConversation]);

  // Track global conversation history changes
  useEffect(() => {
    console.log(`[BaseAssistantPage] globalConversationHistory updated: count=${globalConversationHistory.length}, senders=[${globalConversationHistory.map(m => m.sender).join(', ')}]`);
  }, [globalConversationHistory]);

  // Auto-start conversation on mount and switch to this assistant's context
  useEffect(() => {
    // Switch to this assistant's conversation context
    const assistantId = client.apiBaseUrl; // Use API base URL as unique assistant identifier
    switchAssistant(assistantId);
    
    if (!conversationId && !loading) {
      handleStartConversation();
    }
    
    // Save conversation when unmounting (navigating away)
    return () => {
      if (conversationId) {
        saveAssistantConversation(assistantId);
      }
    };
  }, [conversationId, loading]); // Added conversationId and loading to dependencies

  // Handlers for global state (will be passed down)
  const handleNewMessage = useCallback((msg: ConversationMessage) => {
    setGlobalConversationHistory((prev: any) => [...prev, msg]);
  }, [setGlobalConversationHistory]);

  const handleHumanInputRequired = useCallback((data: any) => {
    if (setGlobalPendingUserInput !== undefined) {
      setGlobalPendingUserInput({
        request_id: data.requestId || '',
        question: data.prompt || '',
        answerType: data.type || '',
        choices: data.metadata?.choices,
        missionId: data.metadata?.missionId,
        inputStepId: data.inputStepId
      } as any);
    }
  }, [setGlobalPendingUserInput]);

  useEffect(() => {
    let unsubscribeMessage: (() => void) | undefined;
    let unsubscribeHumanInput: (() => void) | undefined;
    let unsubscribeError: (() => void) | undefined;
    let unsubscribeEnd: (() => void) | undefined;

    if (conversationId) {
      // REMOVED: client.getHistory(conversationId) call
      // History should now be managed by WebSocketContext's globalConversationHistory

      unsubscribeMessage = client.on('message', handleNewMessage);
      unsubscribeHumanInput = client.on('human_input_required', handleHumanInputRequired);
      unsubscribeError = client.on('error', (err: any) => {
        console.error('WebSocket Error:', err);
        setError(err.message || 'WebSocket error occurred');
      });
      unsubscribeEnd = client.on('end', () => {
        // When conversation ends, clear relevant states
        setConversationId(null);
        // setMessages([]); // No longer managing local messages state
        // setHumanInputRequired(null); // No longer managing local humanInputRequired state
      });
    }

    return () => {
      if (unsubscribeMessage) unsubscribeMessage();
      if (unsubscribeHumanInput) unsubscribeHumanInput();
      if (unsubscribeError) unsubscribeError();
      if (unsubscribeEnd) unsubscribeEnd();
    };
  }, [conversationId, client, handleNewMessage, handleHumanInputRequired]);

  const handleStartConversation = async () => {
    setLoading(true);
    setError(null);
    try {
      // AssistantClient.startConversation now returns missionId (conversationId) directly
      const id = await client.startConversation(initialPrompt, clientId); // Pass clientId here
      setConversationId(id);
      // DO NOT clear history here - WebSocketContext is managing global conversationHistory
      // and the assistant API will send initial messages via WebSocket which will be added to history
    } catch (err: any) {
      setError(err.message || 'Failed to start conversation');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (message: string): Promise<void> => {
    if (!conversationId || !message.trim()) return;

    setLoading(true);
    setError(null);

    try {
      // Add user message to history immediately for instant feedback
      const userMessage: ConversationMessage = {
        id: `user-${Date.now()}`,
        sender: 'user',
        content: message,
        timestamp: new Date(),
        metadata: { conversationId }
      };
      setGlobalConversationHistory((prev: any) => [...prev, userMessage]);

      await client.sendMessage(conversationId, message, clientId);
    } catch (err: any) {
      setError(err.message || 'Failed to send message');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitHumanInput = async (response: string, inputStepId: string): Promise<void> => {
    if (!conversationId || !globalPendingUserInput) return; // Use global pendingUserInput

    setLoading(true);
    setError(null);
    if (setGlobalPendingUserInput !== undefined) {
      setGlobalPendingUserInput(null); // Clear global pending user input
    }

    try {
      await client.submitHumanInput(conversationId, response, inputStepId, clientId);
    } catch (err: any) {
      setError(err.message || 'Failed to submit input');
    } finally {
      setLoading(false);
    }
  };

  const handleSendEvent = async (event: any): Promise<void> => {
    if (!conversationId) return;
    setError(null);
    console.log('[BaseAssistantPage] handleSendEvent - Event:', event);
    console.log('[BaseAssistantPage] handleSendEvent - ConversationId:', conversationId);
    console.log('[BaseAssistantPage] handleSendEvent - ClientId:', clientId);
    try {
      const result = await client.sendEvent(conversationId, event, clientId);
      console.log('[BaseAssistantPage] handleSendEvent - Result:', result);
      if (result?.delta) {
        applyStateDelta(result.delta);
      }
    } catch (err: any) {
      console.error('[BaseAssistantPage] handleSendEvent - Error:', err);
      setError(err.message || 'Failed to send event');
    }
  };

  const handleGetState = (collection: string): any[] => {
    if (!conversationId) return [];
    const state = assistantState[collection];
    return state ? Object.values(state) : [];
  };

  const handleEndConversation = async (): Promise<void> => {
    if (!conversationId) return;

    try {
      await client.endConversation(conversationId, clientId);
      setConversationId(null);
      setGlobalConversationHistory([]); // Clear global history
      if (setGlobalPendingUserInput !== undefined) {
        setGlobalPendingUserInput(null); // Clear global pending user input
      }
    } catch (err: any) {
      setError(err.message || 'Failed to end conversation');
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 2 }}>
        <Typography variant="h4">{title}</Typography>
        {conversationId && (
          <Button variant="outlined" color="error" onClick={handleEndConversation} sx={{ ml: 'auto' }}>
            End Conversation
          </Button>
        )}
      </Box>

      {/* Main content area, either children's custom UI or StandardAssistantChat */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {conversationId && typeof children === 'function' ? (
          children({
            conversationId,
            messages: visibleMessages as any,
            sendMessage: handleSendMessage,
            sendEvent: handleSendEvent,
            assistantState,
            getState: handleGetState,
            mergeAssistantState,
            isLoading: loading,
            error: error,
            humanInputRequired: globalPendingUserInput ? {
              prompt: (globalPendingUserInput as any).question || '',
              type: (globalPendingUserInput as any).answerType || '',
              metadata: { choices: (globalPendingUserInput as any).choices },
              inputStepId: (globalPendingUserInput as any).inputStepId || ''
            } : null,
            submitHumanInput: handleSubmitHumanInput,
            clientId,
          })
        ) : conversationId ? (
          <ChatPanel
            messages={visibleMessages as any}
            onSendMessage={handleSendMessage}
            isLoading={loading}
            error={error}
            assistantName={title}
            enableVoiceInput={true}
            showAssistantName={true}
          />
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <CircularProgress />
            <Typography variant="body2" sx={{ mt: 2 }} color="text.secondary">
              Initializing {title}...
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
};

