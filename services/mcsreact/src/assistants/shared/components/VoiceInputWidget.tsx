import React from 'react';
import { IconButton, Tooltip, CircularProgress, Box } from '@mui/material';
import { Mic as MicIcon, MicOff as MicOffIcon } from '@mui/icons-material';
import { useVoiceInput } from '../hooks/useVoiceInput';

interface VoiceInputWidgetProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  onError?: (error: string) => void;
  showInterim?: boolean;
  language?: string;
}

/**
 * Voice input widget component with STT (Speech-to-Text) capability
 * Uses Web Speech API for browser-based speech recognition
 */
export const VoiceInputWidget: React.FC<VoiceInputWidgetProps> = ({
  onTranscript,
  disabled = false,
  onError,
  showInterim = false,
  language = 'en-US',
}) => {
  const { isListening, interimTranscript, isSupported, toggleListening } = useVoiceInput({
    onTranscript,
    onError,
    language,
  });

  if (!isSupported) {
    return null;
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Tooltip title={isListening ? 'Stop recording' : 'Start voice input'}>
        <Box sx={{ position: 'relative', display: 'inline-flex' }}>
          <IconButton
            onClick={toggleListening}
            disabled={disabled}
            color={isListening ? 'error' : 'default'}
            size="small"
            aria-label="voice input"
          >
            {isListening ? <MicIcon /> : <MicOffIcon />}
          </IconButton>
          {isListening && (
            <CircularProgress
              size={40}
              sx={{
                position: 'absolute',
                left: 0,
                top: 0,
                opacity: 0.2,
              }}
            />
          )}
        </Box>
      </Tooltip>
      {showInterim && isListening && interimTranscript && (
        <Box
          sx={{
            fontSize: '0.85rem',
            fontStyle: 'italic',
            color: 'text.secondary',
            ml: 1,
            maxWidth: 150,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {interimTranscript}
        </Box>
      )}
    </Box>
  );
};

export default VoiceInputWidget;


