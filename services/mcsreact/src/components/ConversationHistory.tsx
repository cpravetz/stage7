import React, { useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import MessageItem from './MessageItem';

interface Props {
  history: string[];
}

const ConversationHistory: React.FC<Props> = React.memo(({ history }) => {
  const historyContainerRef = useRef<HTMLDivElement>(null);
  const shouldScrollToBottomRef = useRef(true);
  const isUserScrollingRef = useRef(false);
  
  // Track the previous history length to detect actual new messages
  const prevHistoryLengthRef = useRef(history.length);
  const lastScrollHeightRef = useRef(0);

  // Handle scroll events to detect user scrolling
  useEffect(() => {
    const element = historyContainerRef.current;
    if (!element) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = element;
      const isAtBottom = scrollHeight - clientHeight <= scrollTop + 100;
      
      // Only update shouldScroll if user is actively scrolling
      if (!isUserScrollingRef.current) {
        isUserScrollingRef.current = true;
        shouldScrollToBottomRef.current = isAtBottom;
        
        // Reset user scrolling flag after a delay
        setTimeout(() => {
          isUserScrollingRef.current = false;
        }, 150);
      }
    };

    element.addEventListener('scroll', handleScroll, { passive: true });
    return () => element.removeEventListener('scroll', handleScroll);
  }, []);

  // Only scroll when new messages are actually added
  useEffect(() => {
    const element = historyContainerRef.current;
    if (!element) return;

    const currentLength = history.length;
    const previousLength = prevHistoryLengthRef.current;
    
    // Only handle scrolling if new messages were added
    if (currentLength > previousLength) {
      const wasAtBottom = shouldScrollToBottomRef.current;
      
      // If user was at bottom or this is the first message, scroll to bottom
      if (wasAtBottom || previousLength === 0) {
        // Use requestAnimationFrame to ensure DOM has updated
        requestAnimationFrame(() => {
          if (element) {
            element.scrollTop = element.scrollHeight;
          }
        });
      }
    }

    // Update the previous length
    prevHistoryLengthRef.current = currentLength;
  }, [history.length]); // Only depend on length, not full history array

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
          flexDirection: 'column',
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
        {history.map((message, index) => (
          <MessageItem key={`message-${index}-${message.substring(0, 50)}`} message={message} />
        ))}
      </Box>
    </Box>
  );
});

ConversationHistory.displayName = 'ConversationHistory';

export default ConversationHistory;