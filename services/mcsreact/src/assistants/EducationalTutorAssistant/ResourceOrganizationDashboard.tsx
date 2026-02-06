import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, TextField, Button, List, ListItem, ListItemText, Grid, Chip, Select, MenuItem, FormControl, InputLabel, CircularProgress, Alert } from '@mui/material/index.js';
import {Add as AddIcon} from '@mui/icons-material';
import { educationAssistantClient } from '../shared/assistantClients'; // Import the client

interface Resource {
  id: string;
  title: string;
  type: 'Video' | 'Article' | 'Book' | 'Website' | 'Exercise' | string; // Added string for flexibility
  topic: string;
  tags: string[];
  url?: string; // Assuming resources might have a URL
}

interface ResourceOrganizationDashboardProps {
  conversationId: string | null;
  client: typeof educationAssistantClient;
  setError: (error: string | null) => void;
  // resources: Resource[]; // This prop is no longer needed as the component fetches its own
}

const ResourceOrganizationDashboard: React.FC<ResourceOrganizationDashboardProps> = ({ conversationId, client, setError }) => {
  const [resources, setResources] = useState<Resource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newResource, setNewResource] = useState<Omit<Resource, 'id' | 'tags' | 'url'>>({ title: '', type: 'Article', topic: '' });
  const [newTagInput, setNewTagInput] = useState<string>('');
  const [currentTags, setCurrentTags] = useState<string[]>([]);

  const resourceTypes: Resource['type'][] = ['Video', 'Article', 'Book', 'Website', 'Exercise'];

  useEffect(() => {
    const fetchResources = async () => {
      if (!conversationId) return;

      setIsLoading(true);
      try {
        const contextData = await client.getContext(conversationId);
        const fetchedResources = contextData.contextItems
          .filter(item => item.type === 'resource')
          .map(item => ({
            id: item.id,
            title: item.title,
            type: (item as any).resourceType || 'Article', // Assuming 'resourceType' field
            topic: (item as any).topic || 'General', // Assuming 'topic' field
            tags: (item as any).tags || [], // Assuming 'tags' field
            url: item.link || undefined, // Assuming 'link' field for URL
          }));
        setResources(fetchedResources);
      } catch (err) {
        console.error('Error fetching resources:', err);
        setError('Failed to load resources.');
        setResources([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchResources();
  }, [conversationId, client, setError]);

  const handleAddResource = async () => {
    if (newResource.title && newResource.topic) {
      if (!conversationId) {
        setError('No active conversation to add resource.');
        return;
      }
      try {
        await client.sendMessage(conversationId, `User wants to create a new resource titled: "${newResource.title}" of type "${newResource.type}" for topic "${newResource.topic}" with tags: ${currentTags.join(', ')}.`);
        setError(null);
        // Optimistic UI update
        setResources([...resources, { ...newResource, id: `temp-${Date.now()}`, tags: currentTags }]);
        setNewResource({ title: '', type: 'Article', topic: '' });
        setCurrentTags([]);
        setNewTagInput('');
      } catch (err) {
        console.error('Error adding resource:', err);
        setError('Failed to request resource creation from assistant.');
      }
    }
  };

  const handleAddTag = () => {
    if (newTagInput && !currentTags.includes(newTagInput)) {
      setCurrentTags([...currentTags, newTagInput]);
      setNewTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setCurrentTags(currentTags.filter(tag => tag !== tagToRemove));
  };

  if (isLoading) {
    return (
      <Box sx={{ mt: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Resource Organization Dashboard
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Add New Resource
            </Typography>
            <TextField
              label="Resource Title"
              fullWidth
              value={newResource.title}
              onChange={(e) => setNewResource({ ...newResource, title: e.target.value })}
              sx={{ mb: 2 }}
            />
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel id="resource-type-label">Type</InputLabel>
              <Select
                labelId="resource-type-label"
                value={newResource.type}
                label="Type"
                onChange={(e) => setNewResource({ ...newResource, type: e.target.value as Resource['type'] })}
              >
                {resourceTypes.map((type) => (
                  <MenuItem key={type} value={type}>
                    {type}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Topic"
              fullWidth
              value={newResource.topic}
              onChange={(e) => setNewResource({ ...newResource, topic: e.target.value })}
              sx={{ mb: 2 }}
            />
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <TextField
                label="Add Tag"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleAddTag();
                  }
                }}
                fullWidth
              />
              <Button variant="contained" onClick={handleAddTag}>Add</Button>
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
              {currentTags.map((tag) => (
                <Chip key={tag} label={tag} onDelete={() => handleRemoveTag(tag)} />
              ))}
            </Box>
            <Button variant="contained" onClick={handleAddResource} fullWidth startIcon={<AddIcon />}>
              Add Resource
            </Button>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Existing Resources
            </Typography>
            <List>
              {resources.length > 0 ? (
                resources.map((resource) => (
                  <ListItem key={resource.id} divider>
                    <ListItemText
                      primary={resource.title}
                      secondary={
                        <React.Fragment>
                          <Typography component="span" variant="body2" color="text.primary">
                            Type: {resource.type} | Topic: {resource.topic}
                          </Typography>
                          <br />
                          Tags: {resource.tags.map(tag => <Chip key={tag} label={tag} size="small" sx={{ mr: 0.5 }} />)}
                        </React.Fragment>
                      }
                    />
                  </ListItem>
                ))
              ) : (
                <ListItem>
                  <ListItemText primary="No resources found." secondary="Resources will appear here once added." />
                </ListItem>
              )}
            </List>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default ResourceOrganizationDashboard;


