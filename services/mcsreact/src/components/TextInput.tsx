import React, { useState, useRef, useEffect } from 'react';
import { Box, TextField, Button, Paper, IconButton } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import MicIcon from '@mui/icons-material/Mic';
import { useTheme } from '@mui/material/styles';

interface Props {
  onSend: (message: string) => void;
}

const TextInput: React.FC<Props> = ({ onSend }) => {
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      onSend(message);
      setMessage('');
    }
  };

  const textFieldRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();

  // Auto-focus the text field when the component mounts
  useEffect(() => {
    if (textFieldRef.current) {
      const input = textFieldRef.current.querySelector('textarea');
      if (input) {
        input.focus();
      }
    }
  }, []);

  // Handle Ctrl+Enter to submit
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  return (
    <Paper
      elevation={2}
      sx={{
        p: 2,
        borderRadius: 2,
        bgcolor: 'background.paper'
      }}
    >
      <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', alignItems: 'flex-end' }}>
        <TextField
          fullWidth
          multiline
          maxRows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter message..."
          variant="outlined"
          ref={textFieldRef}
          sx={{
            mr: 1,
            '& .MuiOutlinedInput-root': {
              borderRadius: 2,
              backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
            }
          }}
        />
        <Box sx={{ display: 'flex', flexDirection: 'column', ml: 1 }}>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={!message.trim()}
            endIcon={<SendIcon />}
            sx={{
              height: '40px',
              borderRadius: 2,
              mb: 1
            }}
          >
            Send
          </Button>
          <IconButton
            color="secondary"
            aria-label="voice input"
            sx={{
              height: '40px',
              width: '40px',
              borderRadius: 2,
              border: `1px solid ${theme.palette.divider}`
            }}
          >
            <MicIcon />
          </IconButton>
        </Box>
      </Box>
      <Box sx={{ mt: 1, fontSize: '0.75rem', color: 'text.secondary', textAlign: 'right' }}>
        Press Ctrl+Enter to send
      </Box>
    </Paper>
  );
};

export default TextInput;