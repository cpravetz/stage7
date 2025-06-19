import React, { useEffect, useRef } from 'react';
import { Box, Typography, Paper, Divider, useTheme } from '@mui/material';
import ReactMarkdown from 'react-markdown';

interface Props {
  history: string[];
}

const ConversationHistory: React.FC<Props> = ({ history }) => {
  const historyListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = historyListRef.current;
    if (element) {
      // Check if the user is scrolled near the bottom before new content is added.
      // This needs to be done carefully. The scrollHeight here is *after* new history is rendered.
      const scrollThreshold = 100; // pixels. Adjust as needed.
      // Consider user scrolled up if they are more than `scrollThreshold` pixels from the bottom.
      const userHasScrolledUp = element.scrollTop + element.clientHeight + scrollThreshold < element.scrollHeight;

      if (!userHasScrolledUp) {
        element.scrollTop = element.scrollHeight;
      }
    }
  }, [history]);

  const theme = useTheme();

  // Function to determine if a message is from the user or the system
  const isUserMessage = (message: string): boolean => {
    return message.startsWith('User:') || message.startsWith('You:');
  };

  // Function to format the message for display
  const formatMessage = (message: string): string => {
    // Remove the prefix (User: or System:) for display
    if (message.startsWith('User:') || message.startsWith('You:') || message.startsWith('System:')) {
      return message.substring(message.indexOf(':') + 1).trim();
    }
    return message;
  };

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
        ref={historyListRef}
        sx={{
          flexGrow: 1,
          overflowY: 'auto',
          px: 2,
          pb: 2,
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
        {history.map((message, index) => {
          const isUser = isUserMessage(message);
          const formattedMessage = formatMessage(message);

          return (
            <Paper
              key={index}
              elevation={1}
              sx={{
                p: 2,
                mb: 2,
                maxWidth: '85%',
                borderRadius: 2,
                bgcolor: isUser ?
                  (theme.palette.mode === 'dark' ? 'primary.dark' : 'primary.light') :
                  (theme.palette.mode === 'dark' ? 'background.paper' : 'background.default'),
                color: isUser ? 'primary.contrastText' : 'text.primary',
                alignSelf: isUser ? 'flex-end' : 'flex-start',
                ml: isUser ? 'auto' : 0,
                position: 'relative',
                '&::after': isUser ? {
                  content: '""',
                  position: 'absolute',
                  right: '-10px',
                  top: '10px',
                  width: 0,
                  height: 0,
                  borderTop: '10px solid transparent',
                  borderBottom: '10px solid transparent',
                  borderLeft: `10px solid ${theme.palette.mode === 'dark' ? theme.palette.primary.dark : theme.palette.primary.light}`,
                } : {},
                '&::before': !isUser ? {
                  content: '""',
                  position: 'absolute',
                  left: '-10px',
                  top: '10px',
                  width: 0,
                  height: 0,
                  borderTop: '10px solid transparent',
                  borderBottom: '10px solid transparent',
                  borderRight: `10px solid ${theme.palette.mode === 'dark' ? theme.palette.background.paper : theme.palette.background.default}`,
                } : {},
              }}
            >
              <Typography
                variant="subtitle2"
                color={isUser ? 'primary.contrastText' : 'text.secondary'}
                sx={{ mb: 1, fontWeight: 'bold' }}
              >
                {isUser ? 'You' : 'System'}
              </Typography>
              <Divider sx={{ mb: 1 }} />
              <ReactMarkdown
                components={{
                  code({ node, className, children, ...props }) {
                    return <code className={className} {...props}>
                      {children}
                    </code>
                  }
                }}
              >
                {formattedMessage}
              </ReactMarkdown>
            </Paper>
          );
        })}
      </Box>
    </Box>
  );
};

export default ConversationHistory;
