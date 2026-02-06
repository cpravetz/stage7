import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Paper, Tabs, Tab, List, ListItem, ListItemText, ListItemAvatar, Avatar, Divider, Badge, CircularProgress, Alert } from '@mui/material/index.js';
import { Chat as ChatIcon, Group as GroupIcon, Mail as MailIcon } from '@mui/icons-material';
import { Message } from '../types'; // Import from shared types
import { CustomerSupportAssistantClient } from './CustomerSupportAssistantClient'; // Import the client

interface MultiChannelInboxProps {
  conversationId: string | null;
  client: CustomerSupportAssistantClient;
  setError: (message: string | null) => void;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function CustomTabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`inbox-tabpanel-${index}`}
      aria-labelledby={`inbox-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `inbox-tab-${index}`,
    'aria-controls': `inbox-tabpanel-${index}`,
  };
}

const MultiChannelInbox: React.FC<MultiChannelInboxProps> = ({ conversationId, client, setError }) => {
  const [tabValue, setTabValue] = useState(0);
  const [emailMessages, setEmailMessages] = useState<Message[]>([]);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [socialMessages, setSocialMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) return;
    setIsLoading(true);
    setError(null);
    try {
      const fetchedEmailMessages = await client.getEmailMessages(conversationId);
      setEmailMessages(fetchedEmailMessages);

      const fetchedChatMessages = await client.getChatMessages(conversationId);
      setChatMessages(fetchedChatMessages);

      const fetchedSocialMessages = await client.getSocialMessages(conversationId);
      setSocialMessages(fetchedSocialMessages);
    } catch (err) {
      console.error('Error fetching messages:', err);
      setError(`Error fetching messages: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, client, setError]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const emailUnreadCount = emailMessages.filter(msg => !msg.read).length;
  const chatUnreadCount = chatMessages.filter(msg => !msg.read).length;
  const socialUnreadCount = socialMessages.filter(msg => !msg.read).length;

  if (isLoading) {
    return (
      <Box sx={{ mt: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ ml: 2 }}>Loading Inbox...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Multi-Channel Inbox
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={handleTabChange} aria-label="multi-channel inbox tabs">
            <Tab
              label={
                <Badge badgeContent={emailUnreadCount} color="error">
                  <MailIcon sx={{ mr: 1 }} /> Email
                </Badge>
              }
              {...a11yProps(0)}
            />
            <Tab
              label={
                <Badge badgeContent={chatUnreadCount} color="error">
                  <ChatIcon sx={{ mr: 1 }} /> Chat
                </Badge>
              }
              {...a11yProps(1)}
            />
            <Tab
              label={
                <Badge badgeContent={socialUnreadCount} color="error">
                  <GroupIcon sx={{ mr: 1 }} /> Social
                </Badge>
              }
              {...a11yProps(2)}
            />
          </Tabs>
        </Box>
        <CustomTabPanel value={tabValue} index={0}>
          {emailMessages.length > 0 ? (
            <List>
              {emailMessages.map((msg) => (
                <React.Fragment key={msg.id}>
                  <ListItem alignItems="flex-start">
                    <ListItemAvatar>
                      <Avatar><MailIcon /></Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={msg.sender}
                      secondary={
                        <React.Fragment>
                          <Typography
                            sx={{ display: 'inline' }}
                            component="span"
                            variant="body2"
                            color="text.primary"
                          >
                            {msg.subject}
                          </Typography>
                          {` — ${msg.preview}`}
                        </React.Fragment>
                      }
                    />
                    <Typography variant="caption" color="text.secondary">{msg.timestamp}</Typography>
                  </ListItem>
                  <Divider variant="inset" component="li" />
                </React.Fragment>
              ))}
            </List>
          ) : (
            <Typography variant="body2" color="text.secondary">No email messages.</Typography>
          )}
        </CustomTabPanel>
        <CustomTabPanel value={tabValue} index={1}>
          {chatMessages.length > 0 ? (
            <List>
              {chatMessages.map((msg) => (
                <React.Fragment key={msg.id}>
                  <ListItem alignItems="flex-start">
                    <ListItemAvatar>
                      <Avatar><ChatIcon /></Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={msg.sender}
                      secondary={
                        <React.Fragment>
                          <Typography
                            sx={{ display: 'inline' }}
                            component="span"
                            variant="body2"
                            color="text.primary"
                          >
                            {msg.subject}
                          </Typography>
                          {` — ${msg.preview}`}
                        </React.Fragment>
                      }
                    />
                    <Typography variant="caption" color="text.secondary">{msg.timestamp}</Typography>
                  </ListItem>
                  <Divider variant="inset" component="li" />
                </React.Fragment>
              ))}
            </List>
          ) : (
            <Typography variant="body2" color="text.secondary">No chat messages.</Typography>
          )}
        </CustomTabPanel>
        <CustomTabPanel value={tabValue} index={2}>
          {socialMessages.length > 0 ? (
            <List>
              {socialMessages.map((msg) => (
                <React.Fragment key={msg.id}>
                  <ListItem alignItems="flex-start">
                    <ListItemAvatar>
                      <Avatar><GroupIcon /></Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={msg.sender}
                      secondary={
                        <React.Fragment>
                          <Typography
                            sx={{ display: 'inline' }}
                            component="span"
                            variant="body2"
                            color="text.primary"
                          >
                            {msg.subject}
                          </Typography>
                          {` — ${msg.preview}`}
                        </React.Fragment>
                      }
                    />
                    <Typography variant="caption" color="text.secondary">{msg.timestamp}</Typography>
                  </ListItem>
                  <Divider variant="inset" component="li" />
                </React.Fragment>
              ))}
            </List>
          ) : (
            <Typography variant="body2" color="text.secondary">No social messages.</Typography>
          )}
        </CustomTabPanel>
      </Paper>
    </Box>
  );
};

export default MultiChannelInbox;


