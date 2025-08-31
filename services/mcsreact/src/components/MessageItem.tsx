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

  // Normalize message content to prevent unintended code block rendering
  const normalizeMessageContent = (content: string): string => {
    // Remove any leading/trailing whitespace that might cause markdown issues
    let normalized = content.trim();
    
    // Ensure consistent line breaks - replace multiple newlines with double newlines for paragraphs
    normalized = normalized.replace(/\n{3,}/g, '\n\n');
    
    // Remove any indentation that might trigger code block parsing
    normalized = normalized.replace(/^[ \t]+/gm, '');
    
    return normalized;
  };

  const isUser = isUserMessage(message);
  const formattedMessage = formatMessage(message);
  const normalizedMessage = normalizeMessageContent(formattedMessage);

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
        {isUser ? 'You' : 'System'}
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
        {normalizedMessage}
      </ReactMarkdown>
    </Paper>
  );
};

export default React.memo(MessageItem);
