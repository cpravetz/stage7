import React, { useState } from 'react';
import { Box, Typography, Paper, TextField, Button, List, ListItem, ListItemText, Divider, Grid, Alert } from '@mui/material/index.js';
import { Character } from './types';

interface StoryIdea {
  id: string;
  title: string;
  logline: string;
  genre: string;
}

interface CreativeCollaborationCenterProps {
  characters: Character[];
  stories: StoryIdea[];
  onShareFeedback: (feedback: string) => void;
  onRequestCollaboration: (request: string) => void;
  onSuggestImprovement: (suggestion: string) => void;
}

const CreativeCollaborationCenter: React.FC<CreativeCollaborationCenterProps> = ({
  characters,
  stories,
  onShareFeedback,
  onRequestCollaboration,
  onSuggestImprovement
}) => {
  const [feedback, setFeedback] = useState<string>('');
  const [collaborationRequest, setCollaborationRequest] = useState<string>('');
  const [suggestion, setSuggestion] = useState<string>('');

  const handleShareFeedback = () => {
    if (feedback.trim()) {
      onShareFeedback(feedback);
      setFeedback('');
    }
  };

  const handleRequestCollaboration = () => {
    if (collaborationRequest.trim()) {
      onRequestCollaboration(collaborationRequest);
      setCollaborationRequest('');
    }
  };

  const handleSuggestImprovement = () => {
    if (suggestion.trim()) {
      onSuggestImprovement(suggestion);
      setSuggestion('');
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Creative Collaboration Center
      </Typography>
      
      <Alert severity="info" sx={{ mb: 3 }}>
        Current project has {characters.length} characters and {stories.length} stories. Collaborate and share ideas with your team.
      </Alert>

      <Grid container spacing={3}>
        <Grid {...({ xs: 12, md: 6, item: true } as any)}>
          <Paper elevation={2} sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Share Feedback
            </Typography>
            <TextField
              label="Your feedback..."
              fullWidth
              multiline
              rows={4}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              sx={{ mb: 2 }}
            />
            <Button
              variant="contained"
              fullWidth
              onClick={handleShareFeedback}
              disabled={!feedback.trim()}
            >
              Share Feedback
            </Button>
          </Paper>
        </Grid>

        <Grid {...({ xs: 12, md: 6, item: true } as any)}>
          <Paper elevation={2} sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Request Collaboration
            </Typography>
            <TextField
              label="What do you need help with?..."
              fullWidth
              multiline
              rows={4}
              value={collaborationRequest}
              onChange={(e) => setCollaborationRequest(e.target.value)}
              sx={{ mb: 2 }}
            />
            <Button
              variant="contained"
              fullWidth
              onClick={handleRequestCollaboration}
              disabled={!collaborationRequest.trim()}
            >
              Request Collaboration
            </Button>
          </Paper>
        </Grid>

        <Grid {...({ xs: 12, item: true } as any)}>
          <Paper elevation={2} sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Suggest Improvement
            </Typography>
            <TextField
              label="What improvements would you suggest?..."
              fullWidth
              multiline
              rows={3}
              value={suggestion}
              onChange={(e) => setSuggestion(e.target.value)}
              sx={{ mb: 2 }}
            />
            <Button
              variant="contained"
              fullWidth
              onClick={handleSuggestImprovement}
              disabled={!suggestion.trim()}
            >
              Submit Suggestion
            </Button>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default CreativeCollaborationCenter;


