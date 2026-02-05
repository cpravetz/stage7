import React from 'react';
import { IconButton, Tooltip, CircularProgress } from '@mui/material';
import { Mic as MicIcon, MicOff as MicOffIcon, Stop as StopIcon } from '@mui/icons-material';

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
  tooltipPlacement?: 'top' | 'right' | 'bottom' | 'left';
}

const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
  onTranscript,
  disabled = false,
  size = 'medium',
  tooltipPlacement = 'top',
}) => {
  const [isListening, setIsListening] = React.useState(false);
  const [isSupported, setIsSupported] = React.useState<boolean | null>(null);
  const recognitionRef = React.useRef<any>(null);

  const initializeRecognition = React.useCallback(() => {
    if (recognitionRef.current) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    setIsSupported(true);
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = false;
    recognitionRef.current.language = 'en-US';

    recognitionRef.current.onstart = () => {
      setIsListening(true);
    };

    recognitionRef.current.onresult = (event: any) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript + ' ';
        }
      }
      if (transcript.trim()) {
        onTranscript(transcript.trim());
      }
    };

    recognitionRef.current.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
    };

    recognitionRef.current.onend = () => {
      setIsListening(false);
    };
  }, [onTranscript]);

  const handleToggle = React.useCallback(() => {
    if (!isSupported && isSupported !== null) return;

    if (!recognitionRef.current) {
      initializeRecognition();
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      recognitionRef.current?.start();
    }
  }, [isListening, isSupported, initializeRecognition]);

  if (isSupported === false) {
    return (
      <Tooltip title="Voice input not supported in this browser">
        <span>
          <IconButton disabled size={size}>
            <MicOffIcon />
          </IconButton>
        </span>
      </Tooltip>
    );
  }

  return (
    <Tooltip title={isListening ? 'Stop recording' : 'Start voice input'} placement={tooltipPlacement}>
      <IconButton
        onClick={handleToggle}
        disabled={disabled}
        color={isListening ? 'error' : 'default'}
        size={size}
      >
        {isListening ? <StopIcon /> : <MicIcon />}
      </IconButton>
    </Tooltip>
  );
};

export default VoiceInputButton;


