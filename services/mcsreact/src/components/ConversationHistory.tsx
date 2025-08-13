import React, { useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import MessageItem from './MessageItem';

interface Props {
  history: string[];
}

const ConversationHistory: React.FC<Props> = React.memo(({ history }) => {
  const historyContainerRef = useRef<HTMLDivElement>(null);
  const shouldScrollToBottomRef = useRef(true);

  // Store last scroll position to prevent unwanted scroll resets
  const lastScrollPositionRef = useRef(0);
  const isUserScrollingRef = useRef(false);

  // Memoize history content to detect actual changes vs reference changes
  const historyContent = useMemo(() => JSON.stringify(history), [history]);
  const prevHistoryContentRef = useRef(historyContent);

  // Track the previous history length to detect new messages
  const prevHistoryLengthRef = useRef(history.length);

  // Handle scroll events to detect user scrolling
  useEffect(() => {
    const element = historyContainerRef.current;
    if (!element) return;

    const handleScroll = () => {
      isUserScrollingRef.current = true;
      lastScrollPositionRef.current = element.scrollTop;

      // Reset user scrolling flag after a delay
      setTimeout(() => {
        isUserScrollingRef.current = false;
      }, 150);
    };

    element.addEventListener('scroll', handleScroll, { passive: true });
    return () => element.removeEventListener('scroll', handleScroll);
  }, []);

  // Before the DOM updates, check if the user is scrolled to the bottom
  useLayoutEffect(() => {
    const element = historyContainerRef.current;
    if (!element) return;

    // Check if content actually changed (not just reference)
    const contentChanged = historyContent !== prevHistoryContentRef.current;
    const lengthIncreased = history.length > prevHistoryLengthRef.current;

    // Only update scroll decision if content actually changed AND length increased
    if (contentChanged && lengthIncreased) {
      const scrollThreshold = 100; // pixels
      const isAtBottom = element.scrollHeight - element.clientHeight <= element.scrollTop + scrollThreshold;
      shouldScrollToBottomRef.current = isAtBottom;
    }

    // Update refs
    prevHistoryContentRef.current = historyContent;
  }, [historyContent, history.length]);

  // After the DOM updates, handle scrolling
  useEffect(() => {
    const element = historyContainerRef.current;
    if (!element) return;

    const currentHistoryLength = history.length;
    const previousHistoryLength = prevHistoryLengthRef.current;
    const contentChanged = historyContent !== prevHistoryContentRef.current;

    // Don't interfere if user is actively scrolling
    if (isUserScrollingRef.current) {
      prevHistoryLengthRef.current = currentHistoryLength;
      return;
    }

    if (contentChanged && currentHistoryLength > previousHistoryLength && shouldScrollToBottomRef.current) {
      // New messages added and we were at bottom - scroll to bottom
      element.scrollTop = element.scrollHeight;
    }
    // For stats updates (same length, content changed), don't change scroll position

    // Update the previous length after processing
    prevHistoryLengthRef.current = currentHistoryLength;
  }, [historyContent, history.length]);

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
          <MessageItem key={index} message={message} />
        ))}
      </Box>
    </Box>
  );
});

export default ConversationHistory;
