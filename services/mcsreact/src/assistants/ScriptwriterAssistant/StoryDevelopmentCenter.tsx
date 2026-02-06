import React, { useState } from 'react';
import { Box, Typography, Paper, TextField, Button, List, ListItem, ListItemText, Grid, IconButton } from '@mui/material/index.js';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { StoryIdea } from './types';

interface StoryDevelopmentCenterProps {
  stories: StoryIdea[];
  onCreateStory: (story: StoryIdea) => void;
  onUpdateStory: (storyId: string, story: Partial<StoryIdea>) => void;
  onDeleteStory: (storyId: string) => void;
  onSelectStory: (storyId: string) => void;
}

const StoryDevelopmentCenter: React.FC<StoryDevelopmentCenterProps> = ({
  stories,
  onCreateStory,
  onUpdateStory,
  onDeleteStory,
  onSelectStory
}) => {
  const [newStoryIdea, setNewStoryIdea] = useState<Omit<StoryIdea, 'id'>>({ title: '', logline: '', genre: '' });
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleAddStoryIdea = () => {
    if (newStoryIdea.title && newStoryIdea.logline) {
      onCreateStory({ ...newStoryIdea, id: String(Date.now()) });
      setNewStoryIdea({ title: '', logline: '', genre: '' });
    }
  };

  const handleStartEdit = (story: StoryIdea) => {
    setEditingId(story.id);
    setNewStoryIdea({ title: story.title, logline: story.logline, genre: story.genre });
  };

  const handleSaveEdit = (storyId: string) => {
    onUpdateStory(storyId, newStoryIdea);
    setEditingId(null);
    setNewStoryIdea({ title: '', logline: '', genre: '' });
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Story Development Center
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          {editingId ? 'Edit Story Idea' : 'Create Story Idea'}
        </Typography>
        <TextField
          label="Title"
          fullWidth
          value={newStoryIdea.title}
          onChange={(e) => setNewStoryIdea({ ...newStoryIdea, title: e.target.value })}
          sx={{ mb: 2 }}
        />
        <TextField
          label="Logline"
          fullWidth
          multiline
          rows={2}
          value={newStoryIdea.logline}
          onChange={(e) => setNewStoryIdea({ ...newStoryIdea, logline: e.target.value })}
          sx={{ mb: 2 }}
        />
        <TextField
          label="Genre"
          fullWidth
          value={newStoryIdea.genre}
          onChange={(e) => setNewStoryIdea({ ...newStoryIdea, genre: e.target.value })}
          sx={{ mb: 2 }}
        />
        {editingId ? (
          <>
            <Button 
              variant="contained" 
              onClick={() => handleSaveEdit(editingId)} 
              fullWidth
              sx={{ mb: 1 }}
            >
              Save Story
            </Button>
            <Button 
              variant="outlined" 
              onClick={() => {
                setEditingId(null);
                setNewStoryIdea({ title: '', logline: '', genre: '' });
              }} 
              fullWidth
            >
              Cancel
            </Button>
          </>
        ) : (
          <Button variant="contained" onClick={handleAddStoryIdea} fullWidth>
            Add Story Idea
          </Button>
        )}
        <List sx={{ mt: 3 }}>
          {stories.map((story) => (
            <ListItem
              key={story.id}
              secondaryAction={
                <Box>
                  <IconButton
                    edge="end"
                    aria-label="select"
                    onClick={() => onSelectStory(story.id)}
                    sx={{ mr: 1 }}
                  >
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    edge="end"
                    aria-label="edit"
                    onClick={() => handleStartEdit(story)}
                    sx={{ mr: 1 }}
                  >
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    edge="end"
                    aria-label="delete"
                    onClick={() => onDeleteStory(story.id)}
                  >
                    <DeleteIcon />
                  </IconButton>
                </Box>
              }
              divider
            >
              <ListItemText 
                primary={story.title} 
                secondary={`${story.logline} (${story.genre})`} 
              />
            </ListItem>
          ))}
        </List>
      </Paper>
    </Box>
  );
};

export default StoryDevelopmentCenter;


