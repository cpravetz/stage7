import React, { useState } from 'react';
import { Box, Typography, Paper, TextField, Button, List, ListItem, ListItemText, ListItemAvatar, Avatar } from '@mui/material/index.js';
import {Send as SendIcon} from '@mui/icons-material';
import {Email as EmailIcon} from '@mui/icons-material';
import {Phone as PhoneIcon} from '@mui/icons-material';

interface PatientCommunicationCenterProps {
  onSendMessage?: (message: string, patientId: string) => void;
  onScheduleFollowUp?: (followUpData: any) => void;
}

interface Message {
  id: string;
  sender: 'Provider' | 'Patient';
  medium: 'Email' | 'SMS' | 'Call';
  content: string;
  timestamp: string;
}

const mockCommunicationHistory: Message[] = [
  { id: 'msg1', sender: 'Provider', medium: 'Email', content: 'Your appointment with Dr. Smith is scheduled for March 20th.', timestamp: '2026-03-15 10:00 AM' },
  { id: 'msg2', sender: 'Patient', medium: 'SMS', content: 'Can I reschedule my appointment for later in the week?', timestamp: '2026-03-15 11:30 AM' },
  { id: 'msg3', sender: 'Provider', medium: 'Call', content: 'Confirmed reschedule to March 23rd.', timestamp: '2026-03-15 01:00 PM' },
];

const PatientCommunicationCenter: React.FC<PatientCommunicationCenterProps> = ({ onSendMessage, onScheduleFollowUp }) => {
  const [messages, setMessages] = useState<Message[]>(mockCommunicationHistory);
  const [newMessageContent, setNewMessageContent] = useState<string>('');
  const [selectedPatient, setSelectedPatient] = useState<string>('John Doe'); // Mock selected patient

  const handleSendMessage = () => {
    if (newMessageContent.trim()) {
      setMessages([...messages, {
        id: String(messages.length + 1),
        sender: 'Provider',
        medium: 'Email', // Default for mock
        content: newMessageContent,
        timestamp: new Date().toLocaleString(),
      }]);
      onSendMessage?.(newMessageContent, selectedPatient);
      setNewMessageContent('');
    }
  };

  const getSenderAvatar = (sender: 'Provider' | 'Patient') => {
    return sender === 'Provider' ? <EmailIcon /> : <PhoneIcon />; // Simplified avatars
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Patient Communication Center - {selectedPatient}
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Communication History
        </Typography>
        <List sx={{ maxHeight: 300, overflow: 'auto', mb: 2, border: '1px solid #eee', borderRadius: 1 }}>
          {messages.map((msg) => (
            <ListItem key={msg.id} alignItems="flex-start">
              <ListItemAvatar>
                <Avatar>{getSenderAvatar(msg.sender)}</Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={<Typography component="span" variant="body2" color="text.primary" sx={{ fontWeight: 'bold' }}>{msg.sender} via {msg.medium} ({msg.timestamp})</Typography>}
                secondary={msg.content}
              />
            </ListItem>
          ))}
        </List>

        <Typography variant="h6" gutterBottom>
          Send New Message
        </Typography>
        <TextField
          label="Message to Patient"
          fullWidth
          multiline
          rows={4}
          value={newMessageContent}
          onChange={(e) => setNewMessageContent(e.target.value)}
          variant="outlined"
          sx={{ mb: 2 }}
        />
        <Button variant="contained" endIcon={<SendIcon />} onClick={handleSendMessage} fullWidth>
          Send Message
        </Button>
      </Paper>
    </Box>
  );
};

export default PatientCommunicationCenter;


