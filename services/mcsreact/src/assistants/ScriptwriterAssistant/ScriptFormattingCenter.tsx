import React from 'react';
import { Box, Typography, Paper, Button, ButtonGroup, Alert } from '@mui/material/index.js';

interface ScriptFormattingCenterProps {
  onApplyFormatting: (format: string) => void;
  onExportScript: (format: string) => void;
  onCheckFormatCompliance: () => void;
}

const ScriptFormattingCenter: React.FC<ScriptFormattingCenterProps> = ({
  onApplyFormatting,
  onExportScript,
  onCheckFormatCompliance
}) => {
  const [scriptContent, setScriptContent] = React.useState("");
  const formatOptions = [
    { label: 'Screenplay', value: 'screenplay' },
    { label: 'Stage Play', value: 'stage_play' },
    { label: 'Novel Format', value: 'novel' },
  ];

  const exportFormats = [
    { label: 'PDF', value: 'pdf' },
    { label: 'DOCX', value: 'docx' },
    { label: 'TXT', value: 'txt' },
  ];

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Script Formatting Center
      </Typography>
      
      <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Apply Format
        </Typography>
        <Alert severity="info" sx={{ mb: 2 }}>
          Select a format to apply consistent styling to your script
        </Alert>
        <ButtonGroup variant="contained" aria-label="script formatting buttons" sx={{ mb: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {formatOptions.map((option) => (
            <Button
              key={option.value}
              onClick={() => onApplyFormatting(option.value)}
              size="small"
            >
              {option.label}
            </Button>
          ))}
        </ButtonGroup>
      </Paper>

      <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Export Script
        </Typography>
        <Alert severity="info" sx={{ mb: 2 }}>
          Export your formatted script in different file formats
        </Alert>
        <ButtonGroup variant="contained" aria-label="export format buttons" sx={{ mb: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {exportFormats.map((format) => (
            <Button
              key={format.value}
              onClick={() => onExportScript(format.value)}
              size="small"
            >
              Export as {format.label}
            </Button>
          ))}
        </ButtonGroup>
      </Paper>

      <Paper elevation={2} sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Format Compliance
        </Typography>
        <Alert severity="info" sx={{ mb: 2 }}>
          Check if your script adheres to standard formatting rules
        </Alert>
        <Button
          variant="contained"
          onClick={onCheckFormatCompliance}
          fullWidth
        >
          Check Format Compliance
        </Button>
        <Button variant="contained" sx={{ mt: 2 }} fullWidth>
          Save Script (Placeholder)
        </Button>
      </Paper>
    </Box>
  );
};

export default ScriptFormattingCenter;


