import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import MessageItem from './MessageItem';

interface Props {
  history: string[];
}

const ConversationHistory: React.FC<Props> = ({ history }) => {
  const historyContainerRef = useRef<HTMLDivElement>(null);
  const shouldScrollToBottomRef = useRef(true);

  // Before the DOM updates, check if the user is scrolled to the bottom.
  // If they are not, we won't auto-scroll on the next update.
  useLayoutEffect(() => {
    const element = historyContainerRef.current;
    if (element) {
      // If the history is empty, it's likely a temporary state during a refresh.
      // Don't update our scroll decision, to prevent jumping when the real data arrives.
      if (history.length === 0) {
        return;
      }

      const scrollThreshold = 100; // pixels.
      const isAtBottom = element.scrollHeight - element.clientHeight <= element.scrollTop + scrollThreshold;
      shouldScrollToBottomRef.current = isAtBottom;
    }
  }, [history]);

  // After the DOM updates with new history, scroll to the bottom if needed.
  useEffect(() => {
    const element = historyContainerRef.current;
    if (element && shouldScrollToBottomRef.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [history]);

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
};

export default ConversationHistory;
