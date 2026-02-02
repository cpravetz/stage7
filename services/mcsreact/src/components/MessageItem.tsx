import React from 'react';
import { Box, Typography, Paper, Divider, useTheme } from '@mui/material/index.js';
import ReactMarkdown from 'react-markdown';
import { ConversationMessage } from '../shared-browser';

interface MessageItemProps {
  message: ConversationMessage;
}

const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
  const theme = useTheme();

  // Determine if it's a user message based on the sender property
  const isUser = message.sender === 'user';
  
  // Extract string content if message.content is an object with a message property
  let displayContent = message.content;
  if (typeof message.content === 'object' && message.content !== null) {
    if ('message' in message.content && typeof (message.content as any).message === 'string') {
      displayContent = (message.content as any).message;
    } else if ('text' in message.content && typeof (message.content as any).text === 'string') {
      displayContent = (message.content as any).text;
    } else {
      // If it's still an object and not a simple message, stringify it
      // This shouldn't happen for user-intended messages after filtering
      displayContent = JSON.stringify(message.content);
    }
  }

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
        wordBreak: 'break-word',
        whiteSpace: 'pre-wrap',
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
        '& code': {
          fontFamily: 'source-code-pro, Menlo, Monaco, Consolas, "Courier New", monospace',
          backgroundColor: theme.palette.mode === 'dark' ? '#2d2d2d' : '#f5f5f5',
          padding: '2px 4px',
          borderRadius: '4px',
          fontSize: '0.875rem',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        },
        '& pre': {
          fontFamily: 'source-code-pro, Menlo, Monaco, Consolas, "Courier New", monospace',
          backgroundColor: theme.palette.mode === 'dark' ? '#2d2d2d' : '#f5f5f5',
          padding: '8px',
          borderRadius: '4px',
          fontSize: '0.875rem',
          overflowX: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          margin: '0 0 1em 0',
        },
        '& strong': {
          fontWeight: theme.typography.fontWeightBold,
        },
        '& em': {
          fontStyle: 'italic',
        },
        '& blockquote': {
          borderLeft: `4px solid ${theme.palette.divider}`,
          margin: '0 0 1em 0',
          paddingLeft: '1em',
          color: theme.palette.text.secondary,
          fontStyle: 'italic',
        },
        '& ul, & ol': {
          paddingLeft: '1.5em',
          margin: '0 0 1em 0',
        },
        '& li': {
          marginBottom: '0.25em',
        },
      }}
    >
      <Typography variant="subtitle2" color={isUser ? 'primary.contrastText' : 'text.secondary'} sx={{ mb: 1, fontWeight: 'bold' }}>
        {message.sender.charAt(0).toUpperCase() + message.sender.slice(1)}
      </Typography>
      <Divider sx={{ mb: 1 }} />
      <ReactMarkdown
        components={{
          p({ node, children, ...props }) {
            return (
              <Typography 
                component="p" 
                variant="body1"
                sx={{ 
                  margin: '0 0 1em 0',
                  fontFamily: theme.typography.fontFamily,
                  fontSize: theme.typography.body1.fontSize,
                  lineHeight: theme.typography.body1.lineHeight,
                  color: isUser ? theme.palette.primary.contrastText : theme.palette.text.primary,
                }}
                {...props}
              >
                {children}
              </Typography>
            );
          },
          code({ node, className, children, ...props }) {
            return <code className={className} {...props}>
              {children}
            </code>
          }
        }}
      >
        {String(displayContent)}
      </ReactMarkdown>
    </Paper>
  );
};

export default React.memo(MessageItem);
