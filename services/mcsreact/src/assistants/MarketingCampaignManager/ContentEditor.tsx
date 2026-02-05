import React, { useState } from 'react';
import { Box, Typography, TextField, Button, Tabs, Tab, Paper, List, ListItem, ListItemText, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Select, MenuItem, FormControl, InputLabel } from '@mui/material/index.js';
import { ContentItem } from './types';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';

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

interface ContentEditorProps {
  contentItems: ContentItem[];
  onCreateContent: (content: ContentItem) => void;
  onUpdateContent: (id: string, updates: Partial<ContentItem>) => void;
  onDeleteContent: (id: string) => void;
  sendMessage: (message: string) => Promise<any>;
}

const ContentEditor: React.FC<ContentEditorProps> = ({
  contentItems,
  onCreateContent,
  onUpdateContent,
  onDeleteContent,
  sendMessage
}) => {
  const [content, setContent] = useState<string>('');
  const [tabValue, setTabValue] = useState(0);
  const [openDialog, setOpenDialog] = useState(false);
  const [currentContent, setCurrentContent] = useState<ContentItem | null>(null);
  const [contentType, setContentType] = useState<'blog' | 'social' | 'email' | 'video' | 'ad'>('blog');

  const handleChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const generatePreview = (platform: string) => {
    return `Preview for ${platform}:\n\n${content}`;
  };

  const handleCreateContent = () => {
    const newContent: ContentItem = {
      id: Date.now().toString(),
      title: 'New Content',
      type: contentType,
      status: 'draft',
      campaignId: '',
      publishDate: new Date().toISOString().split('T')[0],
      content: content,
      author: 'Current User',
      performanceMetrics: undefined
    };
    onCreateContent(newContent);
    setContent('');
  };

  const handleEditClick = (item: ContentItem) => {
    setCurrentContent(item);
    setContent(item.content);
    setContentType(item.type);
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setCurrentContent(null);
  };

  const handleSaveEdit = () => {
    if (currentContent) {
      onUpdateContent(currentContent.id, { content: content, type: contentType });
      handleCloseDialog();
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Multi-Channel Content Editor
      </Typography>
      <Paper elevation={2} sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <FormControl fullWidth>
            <InputLabel>Content Type</InputLabel>
            <Select
              value={contentType}
              label="Content Type"
              onChange={(e) => setContentType(e.target.value as ContentItem['type'])}
            >
              <MenuItem value="blog">Blog</MenuItem>
              <MenuItem value="social">Social Media</MenuItem>
              <MenuItem value="email">Email</MenuItem>
              <MenuItem value="video">Video</MenuItem>
              <MenuItem value="ad">Ad</MenuItem>
            </Select>
          </FormControl>
        </Box>
        <TextField
          label="Content Input"
          multiline
          rows={6}
          fullWidth
          value={content}
          onChange={(e) => setContent(e.target.value)}
          variant="outlined"
          sx={{ mb: 2 }}
        />
        <Button 
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={handleCreateContent}
          sx={{ mb: 2, mr: 2 }}
        >
          Create Content
        </Button>
        <Button variant="contained" sx={{ mb: 2 }}>
          Collaborate (Placeholder)
        </Button>

        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={handleChange} aria-label="content preview tabs">
            <Tab label="Social Media" {...a11yProps(0)} />
            <Tab label="Email" {...a11yProps(1)} />
            <Tab label="Blog" {...a11yProps(2)} />
          </Tabs>
        </Box>
        <CustomTabPanel value={tabValue} index={0}>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {generatePreview('Social Media')}
          </Typography>
        </CustomTabPanel>
        <CustomTabPanel value={tabValue} index={1}>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {generatePreview('Email')}
          </Typography>
        </CustomTabPanel>
        <CustomTabPanel value={tabValue} index={2}>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {generatePreview('Blog')}
          </Typography>
        </CustomTabPanel>
      </Paper>

      <Typography variant="h6" gutterBottom>
        Existing Content
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <List>
          {contentItems.map((item) => (
            <ListItem key={item.id} secondaryAction={
              <>
                <IconButton edge="end" aria-label="edit" onClick={() => handleEditClick(item)}>
                  <EditIcon />
                </IconButton>
                <IconButton edge="end" aria-label="delete" onClick={() => onDeleteContent(item.id)}>
                  <DeleteIcon />
                </IconButton>
              </>
            }>
              <ListItemText 
                primary={item.title}
                secondary={`${item.type} - ${item.status}`}
              />
            </ListItem>
          ))}
        </List>
      </Paper>

      <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="md">
        <DialogTitle>Edit Content</DialogTitle>
        <DialogContent>
          <TextField
            label="Title"
            value={currentContent?.title || ''}
            fullWidth
            margin="normal"
            disabled
          />
          <FormControl fullWidth margin="normal">
            <InputLabel>Content Type</InputLabel>
            <Select
              value={contentType}
              label="Content Type"
              onChange={(e) => setContentType(e.target.value as ContentItem['type'])}
            >
              <MenuItem value="blog">Blog</MenuItem>
              <MenuItem value="social">Social Media</MenuItem>
              <MenuItem value="email">Email</MenuItem>
              <MenuItem value="video">Video</MenuItem>
              <MenuItem value="ad">Ad</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Content"
            multiline
            rows={6}
            fullWidth
            value={content}
            onChange={(e) => setContent(e.target.value)}
            margin="normal"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} color="secondary">
            Cancel
          </Button>
          <Button onClick={handleSaveEdit} color="primary">
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ContentEditor;


