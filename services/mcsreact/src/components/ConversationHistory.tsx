import React, { useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import MessageItem from './MessageItem';
import { ConversationMessage } from '../shared-browser';

interface Props {
  history: ConversationMessage[];
}

export const ConversationHistory: React.FC<Props> = React.memo(({ history }) => {
  const historyContainerRef = useRef<HTMLDivElement>(null);
  const shouldScrollToBottomRef = useRef(true);

  const processedHistory = useMemo(() => {
    const persistentMessages = history.filter(message => message.persistent);

    const lastMessage = history.length > 0 ? history[history.length - 1] : null;

    if (lastMessage && !lastMessage.persistent) {
      // The last message is a temporary update, so we display it.
      return [...persistentMessages, lastMessage];
    }

    // The last message is persistent, so we only display persistent messages.
    return persistentMessages;
  }, [history]);
  
  // Handle scroll events to detect user scrolling
  useEffect(() => {
    const element = historyContainerRef.current;
    if (!element) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = element;
      // Consider within 50px of bottom as "at bottom" for smoother experience
      const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 50;
      
      // Update scroll lock state
      shouldScrollToBottomRef.current = isAtBottom;
    };

    element.addEventListener('scroll', handleScroll, { passive: true });
    return () => element.removeEventListener('scroll', handleScroll);
  }, []);

  // Scroll handling using useLayoutEffect for smoother updates
  useLayoutEffect(() => {
    const element = historyContainerRef.current;
    if (!element) return;

    // Always scroll to bottom unless user has explicitly scrolled up
    const shouldScroll = shouldScrollToBottomRef.current;
    
    if (shouldScroll) {
      element.scrollTop = element.scrollHeight;
    }
  }, [processedHistory]); // Depend on processedHistory to catch all updates

  const theme = useTheme();

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      <Typography variant="h6" sx={{ mb: 2, px: 2 }}>
        Conversation History
      </Typography>
      <Box
        ref={historyContainerRef}
        sx={{
          flexGrow: 1,
          overflowY: 'auto',
          px: 2,
          pb: 2,
          display: 'flex',
          flexDirection: 'column', // Display messages top-to-bottom
          '&::-webkit-scrollbar': {
            width: '8px',
          },
          '&::-webkit-scrollbar-track': {
            backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
            borderRadius: '4px',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
            borderRadius: '4px',
            '&:hover': {
              backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)',
            },
          },
        }}
      >
        {processedHistory.map((message, index) => (
          <MessageItem key={`message-${index}-${message.content.substring(0, 50)}`} message={message.content} />
        ))}
      </Box>
    </Box>
  );
});