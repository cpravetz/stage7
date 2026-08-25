import React, { useState, useRef, useEffect } from 'react';
import { Box, TextField, Button, Paper, IconButton, Typography } from '@mui/material';
import { Send as SendIcon, Mic as MicIcon } from '@mui/icons-material';
import { useTheme } from '@mui/material';
import { AnswerType } from '../shared-browser';

export interface ActiveQuestion {
  requestId: string;
  question: string;
  choices?: string[];
  answerType: AnswerType;
}

interface Props {
  onSend: (message: string) => void;
  activeQuestion: ActiveQuestion | null;
  onAnswer: (requestId: string, answer: string) => void;
  onCancelQuestion: () => void;
}

const TextInput: React.FC<Props> = ({ onSend, activeQuestion, onAnswer, onCancelQuestion }) => {
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      if (activeQuestion) {
        onAnswer(activeQuestion.requestId, message);
      } else {
        onSend(message);
      }
      setMessage('');
    }
  };

  const textFieldRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();

  // Auto-focus the text field when the component mounts or activeQuestion changes
  useEffect(() => {
    if (textFieldRef.current) {
      const input = textFieldRef.current.querySelector('textarea');
      if (input) {
        input.focus();
      }
    }
  }, [activeQuestion]); // Re-focus when activeQuestion changes

  // Handle Ctrl+Enter to submit
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  const isInputDisabled = activeQuestion !== null && activeQuestion.answerType !== 'text';

  return (
    <Paper
      elevation={2}
      sx={{
        p: 2,
        borderRadius: 2,
        bgcolor: 'background.paper'
      }}
    >
      {activeQuestion && (
        <Box sx={{ mb: 2, p: 1, bgcolor: theme.palette.action.hover, borderRadius: 1 }}>
          <Typography variant="subtitle2" color="text.secondary">
            Question from System:
          </Typography>
          <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
            {activeQuestion.question}
          </Typography>
        </Box>
      )}
      <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', alignItems: 'flex-end' }}>
        <TextField
          fullWidth
          multiline
          maxRows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={activeQuestion ? "Enter your answer..." : "Enter message..."}
          variant="outlined"
          ref={textFieldRef}
          disabled={isInputDisabled}
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
            disabled={!message.trim() || isInputDisabled}
            endIcon={<SendIcon />}
            sx={{
              height: '40px',
              borderRadius: 2,
              mb: 1
            }}
          >
            {activeQuestion ? 'Submit Answer' : 'Send'}
          </Button>
          {activeQuestion && (
            <Button
              variant="outlined"
              color="secondary"
              onClick={onCancelQuestion}
              sx={{
                height: '40px',
                borderRadius: 2,
                mb: 1
              }}
            >
              Cancel
            </Button>
          )}
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