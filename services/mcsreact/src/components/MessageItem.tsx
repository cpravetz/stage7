import React from 'react';
import { Box, Typography, Paper, Divider, useTheme } from '@mui/material';
import ReactMarkdown from 'react-markdown';

interface MessageItemProps {
  message: string;
}

const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
  const theme = useTheme();

  const isUserMessage = (msg: string): boolean => {
    return msg.startsWith('User:') || msg.startsWith('You:');
  };

  const formatMessage = (msg: string): string => {
    if (msg.startsWith('User:') || msg.startsWith('You:') || msg.startsWith('System:')) {
      return msg.substring(msg.indexOf(':') + 1).trim();
    }
    return msg;
  };

  const isUser = isUserMessage(message);
  const formattedMessage = formatMessage(message);

  return (
    <Paper
      elevation={1}
      sx={{
        p: 2,
        mb: 2,
        maxWidth: '85%',
        borderRadius: 2,
        bgcolor: isUser
          ? (theme.palette.mode === 'dark' ? 'primary.dark' : 'primary.light')
          : (theme.palette.mode === 'dark' ? 'background.paper' : 'background.default'),
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
      <Typography variant="subtitle2" color={isUser ? 'primary.contrastText' : 'text.secondary'} sx={{ mb: 1, fontWeight: 'bold' }}>
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
};

export default React.memo(MessageItem);