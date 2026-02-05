import React, { useState } from 'react';
import { Typography, Button, TextField, Box, FormControl, InputLabel, Select, MenuItem, FormHelperText, useTheme } from '@mui/material/index.js';

interface HumanInputWidgetProps {
  prompt: string;
  type: 'ask' | 'boolean' | 'select' | 'file';
  metadata?: {
    options?: Array<{ value: string; label: string }>;
    placeholder?: string;
    validation?: { required?: boolean; pattern?: string };
    multiline?: boolean;
    fileTypes?: string[];
  };
  inputStepId: string; // Required to submit input to the backend
  onSubmit: (response: string, inputStepId: string) => void;
  onCancel?: () => void;
}

const HumanInputWidget: React.FC<HumanInputWidgetProps> = ({
  prompt,
  type,
  metadata,
  inputStepId,
  onSubmit,
  onCancel
}) => {
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const theme = useTheme();

  const validateInput = () => {
    if (metadata?.validation?.required && !inputValue.trim()) {
      setError('This field is required');
      return false;
    }
    
    if (metadata?.validation?.pattern && !new RegExp(metadata.validation.pattern).test(inputValue)) {
      setError('Input does not match required format');
      return false;
    }
    
    setError(null);
    return true;
  };

  const handleSubmit = () => {
    if (validateInput()) {
      onSubmit(inputValue, inputStepId);
      setInputValue('');
    }
  };

  const handleFileSubmit = () => {
    if (file) {
      onSubmit(file.name, inputStepId);
      setFile(null);
    }
  };

  if (type === 'boolean') {
    return (
      <Box sx={{ p: 2, backgroundColor: theme.palette.background.default, borderRadius: 1, boxShadow: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          {prompt}
        </Typography>
        <Box display="flex" gap={1} mt={2}>
          <Button
            variant="contained"
            color="primary"
            onClick={() => onSubmit('true', inputStepId)}
          >
            Yes
          </Button>
          <Button
            variant="contained"
            color="secondary"
            onClick={() => onSubmit('false', inputStepId)}
          >
            No
          </Button>
        </Box>
      </Box>
    );
  }

  if (type === 'select' && metadata?.options) {
    return (
      <Box sx={{ p: 2, backgroundColor: theme.palette.background.default, borderRadius: 1, boxShadow: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          {prompt}
        </Typography>
        <FormControl fullWidth sx={{ mt: 2 }}>
          <InputLabel>Select an option</InputLabel>
          <Select
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            label="Select an option"
            error={!!error}
          >
            {metadata.options.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
          {error && <FormHelperText error>{error}</FormHelperText>}
        </FormControl>
        <Box display="flex" gap={1} mt={2}>
          <Button variant="contained" onClick={handleSubmit}>
            Submit
          </Button>
          {onCancel && (
            <Button variant="outlined" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </Box>
      </Box>
    );
  }

  if (type === 'file') {
    return (
      <Box sx={{ p: 2, backgroundColor: theme.palette.background.default, borderRadius: 1, boxShadow: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          {prompt}
        </Typography>
        <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <input
            type="file"
            accept={metadata?.fileTypes?.join(',') || '*/*'}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            style={{ padding: '10px' }}
          />
          {file && (
            <Typography variant="body2">
              Selected: {file.name}
            </Typography>
          )}
          <Box display="flex" gap={1}>
            <Button variant="contained" onClick={handleFileSubmit} disabled={!file}>
              Upload
            </Button>
            {onCancel && (
              <Button variant="outlined" onClick={onCancel}>
                Cancel
              </Button>
            )}
          </Box>
        </Box>
      </Box>
    );
  }

  // Default 'ask' type
  return (
    <Box sx={{ p: 2, backgroundColor: theme.palette.background.default, borderRadius: 1, boxShadow: 2 }}>
      <Typography variant="subtitle2" gutterBottom>
        {prompt}
      </Typography>
      <TextField
        fullWidth
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder={metadata?.placeholder || "Type your response..."}
        error={!!error}
        helperText={error}
        multiline={metadata?.multiline || false}
        rows={metadata?.multiline ? 4 : 1}
        sx={{ mt: 2 }}
      />
      <Box display="flex" gap={1} mt={2}>
        <Button variant="contained" onClick={handleSubmit}>
          Submit
        </Button>
        {onCancel && (
          <Button variant="outlined" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </Box>
    </Box>
  );
};

export default HumanInputWidget;

