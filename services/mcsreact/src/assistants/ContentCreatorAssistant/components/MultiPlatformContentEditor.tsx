import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, TextField, Button, Tabs, Tab, Grid, Select, MenuItem, FormControl, InputLabel } from '@mui/material/index.js';
import { ContentPiece } from '../types';

interface MultiPlatformContentEditorProps {
  contentToEdit: ContentPiece | null;
  onSave: (content: ContentPiece) => void;
  onCancel: () => void;
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
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
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
    id: `simple-tab-${index}`,
    'aria-controls': `simple-tabpanel-${index}`,
  };
}

const MultiPlatformContentEditor: React.FC<MultiPlatformContentEditorProps> = ({ contentToEdit, onSave, onCancel }) => {
  const [contentTitle, setContentTitle] = useState<string>(contentToEdit?.title || '');
  const [contentBody, setContentBody] = useState<string>(contentToEdit?.content || '');
  const [selectedPlatform, setSelectedPlatform] = useState<ContentPiece['platform']>(contentToEdit?.platform || 'Social Media');
  const [tabValue, setTabValue] = useState(0);

  useEffect(() => {
    if (contentToEdit) {
      setContentTitle(contentToEdit.title);
      setContentBody(contentToEdit.content);
      setSelectedPlatform(contentToEdit.platform);
    } else {
      setContentTitle('');
      setContentBody('');
      setSelectedPlatform('Social Media');
    }
  }, [contentToEdit]);

  const platforms: ContentPiece['platform'][] = ['Social Media', 'Email', 'Blog', 'Video'];

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleLocalSaveContent = () => {
    const newContent: ContentPiece = {
      id: contentToEdit?.id || Date.now().toString(),
      title: contentTitle,
      content: contentBody,
      platform: selectedPlatform,
      status: contentToEdit?.status || 'Draft',
    };
    onSave(newContent);
  };

  const generatePreview = (platform: ContentPiece['platform']) => {
    // This is a placeholder for actual platform-specific rendering logic
    let preview = `Preview for ${platform}:

`;
    preview += `Title: ${contentTitle}

`;
    preview += contentBody;

    if (platform === 'Social Media' && contentBody.length > 280) {
      preview += `

(Note: Social media posts often have character limits. Current: ${contentBody.length} chars)`;
    } else if (platform === 'Email') {
      preview += `

(Image attachments, call-to-actions, and branding elements would be here in a real email preview)`;
    }
    return preview;
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Multi-Platform Content Editor
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <TextField
              label="Content Title"
              fullWidth
              value={contentTitle}
              onChange={(e) => setContentTitle(e.target.value)}
              sx={{ mb: 2 }}
            />
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel id="platform-select-label">Target Platform</InputLabel>
              <Select
                labelId="platform-select-label"
                value={selectedPlatform}
                label="Target Platform"
                onChange={(e) => setSelectedPlatform(e.target.value as ContentPiece['platform'])}
              >
                {platforms.map((platform) => (
                  <MenuItem key={platform} value={platform}>
                    {platform}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Content Body"
              multiline
              rows={10}
              fullWidth
              value={contentBody}
              onChange={(e) => setContentBody(e.target.value)}
              sx={{ mb: 2 }}
            />
            <Button variant="contained" onClick={handleLocalSaveContent} fullWidth sx={{ mb: 1 }}>
              Save Content
            </Button>
            <Button variant="outlined" onClick={onCancel} fullWidth>
              Cancel
            </Button>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Platform Previews
            </Typography>
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tabs value={tabValue} onChange={handleTabChange} aria-label="content platform previews">
                {platforms.map((platform, index) => (
                  <Tab key={platform} label={platform} {...a11yProps(index)} />
                ))}
              </Tabs>
            </Box>
            {platforms.map((platform, index) => (
              <CustomTabPanel key={platform} value={tabValue} index={index}>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {generatePreview(platform)}
                </Typography>
              </CustomTabPanel>
            ))}
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default MultiPlatformContentEditor;


