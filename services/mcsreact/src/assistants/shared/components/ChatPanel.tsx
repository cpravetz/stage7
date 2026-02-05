import React, { useState, useCallback } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  useTheme,
} from '@mui/material/index.js';
import { ConversationMessage } from '@cktmcs/sdk';
import { useChatMessages } from '../hooks/useChatMessages';
import { VoiceInputWidget } from './VoiceInputWidget';

export interface ChatPanelProps {
  // Required
  messages: ConversationMessage[];
  onSendMessage: (message: string) => void | Promise<void>;

  // Optional display
  isLoading?: boolean;
  error?: string | null;
  assistantName?: string;
  placeholderText?: string;
  title?: string;

  // Optional features
  enableVoiceInput?: boolean;
  enableHeader?: boolean;
  showAssistantName?: boolean;
  showVoiceInterim?: boolean;
  voiceInputLanguage?: string;

  // Optional callbacks
  onHeaderClick?: () => void;
  onErrorDismiss?: () => void;

  // Optional styling
  containerStyle?: React.CSSProperties;
  messageBubbleStyle?: React.CSSProperties;
  inputAreaStyle?: React.CSSProperties;
  headerStyle?: React.CSSProperties;

  // Optional state
  disableInput?: boolean;
}

/**
 * Unified chat panel component for displaying conversation history and input controls
 * Replaces StandardAssistantChat, ConversationComponent, and LiveChatInterface
 * Supports text input, voice-to-text (STT), and optional header
 */
export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  onSendMessage,
  isLoading = false,
  error = null,
  assistantName = 'Assistant',
  placeholderText = 'Type your message...',
  title,
  enableVoiceInput = true,
  enableHeader = true,
  showAssistantName = true,
  showVoiceInterim = false,
  voiceInputLanguage = 'en-US',
  onHeaderClick,
  onErrorDismiss,
  containerStyle,
  messageBubbleStyle,
  inputAreaStyle,
  headerStyle,
  disableInput = false,
}) => {
  const [inputMessage, setInputMessage] = useState('');
  const { messagesEndRef } = useChatMessages(messages);
  const theme = useTheme();

  const timestamp = new Date().toLocaleTimeString();
  console.log(`[ChatPanel] ${timestamp} Received messages prop:`, {
    count: messages.length,
    lastMessage: messages.length > 0 ? {
      sender: messages[messages.length - 1].sender,
      content: messages[messages.length - 1].content?.toString().substring(0, 50),
      timestamp: messages[messages.length - 1].timestamp
    } : null,
    allSenders: messages.map(m => m.sender)
  });

  const handleSend = useCallback(async () => {
    if (!inputMessage.trim()) return;
    const messageToSend = inputMessage;
    setInputMessage('');
    await onSendMessage(messageToSend);
  }, [inputMessage, onSendMessage]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleVoiceTranscript = useCallback(
    (transcript: string) => {
      setInputMessage((prev) => (prev ? `${prev} ${transcript}` : transcript));
    },
    []
  );

  const isInputDisabled = disableInput || isLoading;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: theme.palette.background.paper,
        ...containerStyle,
      }}
    >
      {/* Header */}
      {enableHeader && (title || showAssistantName) && (
        <Box
          sx={{
            p: 2,
            borderBottom: 1,
            borderColor: 'divider',
            cursor: onHeaderClick ? 'pointer' : 'default',
            backgroundColor: theme.palette.background.default,
            ...headerStyle,
          }}
          onClick={onHeaderClick}
        >
          <Typography variant="h6">
            {title || (showAssistantName ? assistantName : 'Conversation')}
          </Typography>
        </Box>
      )}

      {/* Error Alert */}
      {error && (
        <Alert
          severity="error"
          sx={{ m: 2, mt: enableHeader ? 1 : 2 }}
          onClose={onErrorDismiss}
        >
          {error}
        </Alert>
      )}

      {/* Messages Area */}
      <Box
        sx={{
          flexGrow: 1,
          overflowY: 'auto',
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
        }}
      >
        {messages.length === 0 && !isLoading && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              Start a conversation with {showAssistantName ? assistantName : 'the assistant'}
            </Typography>
          </Box>
        )}

        {messages.map((msg, idx) => (
          <Paper
            key={idx}
            elevation={msg.sender === 'user' ? 2 : 1}
            sx={{
              p: 1.5,
              borderRadius: 2,
              backgroundColor:
                msg.sender === 'user' ? theme.palette.primary.light : theme.palette.background.default,
              color: msg.sender === 'user' ? theme.palette.primary.contrastText : theme.palette.text.primary,
              alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '80%',
              wordBreak: 'break-word',
              ...messageBubbleStyle,
            }}
          >
            <Typography variant="caption" display="block" sx={{ opacity: 0.7, mb: 0.5 }}>
              {msg.sender === 'user' ? 'You' : showAssistantName ? assistantName : 'Assistant'} •{' '}
              {new Date(msg.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content, null, 2)}
            </Typography>
          </Paper>
        ))}

        {isLoading && (
          <Box
            sx={{
              p: 1.5,
              borderRadius: 2,
              backgroundColor: theme.palette.background.default,
              alignSelf: 'flex-start',
              maxWidth: '80%',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <CircularProgress size={20} />
            <Typography variant="body2" color="text.secondary">
              <em>Thinking...</em>
            </Typography>
          </Box>
        )}

        <div ref={messagesEndRef} />
      </Box>

      {/* Input Area */}
      <Box
        sx={{
          p: 2,
          borderTop: 1,
          borderColor: 'divider',
          backgroundColor: theme.palette.background.default,
          ...inputAreaStyle,
        }}
      >
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
          <TextField
            fullWidth
            size="small"
            variant="outlined"
            placeholder={placeholderText}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isInputDisabled}
            multiline
            maxRows={3}
            minRows={1}
          />

          {enableVoiceInput && (
            <VoiceInputWidget
              onTranscript={handleVoiceTranscript}
              disabled={isInputDisabled}
              language={voiceInputLanguage}
              showInterim={showVoiceInterim}
            />
          )}

          <Button
            variant="contained"
            onClick={handleSend}
            disabled={isInputDisabled || !inputMessage.trim()}
            sx={{ whiteSpace: 'nowrap', height: '40px' }}
          >
            Send
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default ChatPanel;
