import React from 'react';
import { Box, Typography, Button, List, ListItem, ListItemText, TextField, Paper, Rating, Chip } from '@mui/material/index.js';

interface FeedbackItem {
  id: string;
  guestName: string;
  rating: number;
  comments: string;
  date: string;
  responded: boolean;
  response?: string;
}

interface GuestFeedbackProps {
  feedbackItems: FeedbackItem[];
  sendMessage: (message: string) => Promise<void>;
}

const GuestFeedback: React.FC<GuestFeedbackProps> = ({
  feedbackItems,
  sendMessage
}) => {
  const [newFeedback, setNewFeedback] = React.useState<{
    guestName: string;
    rating: number;
    comments: string;
  }>({
    guestName: '',
    rating: 5,
    comments: ''
  });

  const [responses, setResponses] = React.useState<Record<string, string>>({});

  const handleAdd = () => {
    if (newFeedback.guestName && newFeedback.comments) {
      sendMessage(`Add guest feedback: ${JSON.stringify({
        guestName: newFeedback.guestName,
        rating: newFeedback.rating,
        comments: newFeedback.comments,
        date: new Date().toISOString()
      })}`);
      setNewFeedback({ guestName: '', rating: 5, comments: '' });
    }
  };

  const handleRespond = (feedbackId: string) => {
    if (responses[feedbackId]) {
      sendMessage(`Respond to feedback ${feedbackId}: ${responses[feedbackId]}`);
      setResponses({...responses, [feedbackId]: ''});
    }
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Guest Feedback
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Add New Feedback
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
          <TextField
            label="Guest Name"
            value={newFeedback.guestName}
            onChange={(e) => setNewFeedback({...newFeedback, guestName: e.target.value})}
            sx={{ flex: 1, minWidth: 200 }}
          />
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography sx={{ mr: 1 }}>Rating:</Typography>
            <Rating
              value={newFeedback.rating}
              onChange={(_, newValue) => setNewFeedback({...newFeedback, rating: newValue || 5})}
            />
          </Box>
        </Box>
        <TextField
          label="Comments"
          value={newFeedback.comments}
          onChange={(e) => setNewFeedback({...newFeedback, comments: e.target.value})}
          fullWidth
          multiline
          rows={3}
          sx={{ mb: 2 }}
        />
        <Button
          variant="contained"
          color="primary"
          onClick={handleAdd}
          disabled={!newFeedback.guestName || !newFeedback.comments}
        >
          Add Feedback
        </Button>
      </Paper>

      <Typography variant="subtitle1" gutterBottom>
        Recent Feedback
      </Typography>

      <List>
        {feedbackItems.map((feedback) => (
          <ListItem key={feedback.id} alignItems="flex-start" sx={{ mb: 2 }}>
            <ListItemText
              primary={
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography component="span" variant="subtitle2">
                      {feedback.guestName}
                    </Typography>
                    <Rating value={feedback.rating} readOnly size="small" sx={{ ml: 1 }} />
                  </Box>
                  <Chip
                    label={new Date(feedback.date).toLocaleDateString()}
                    size="small"
                    variant="outlined"
                  />
                </Box>
              }
              secondary={
                <>
                  <Typography component="span" variant="body2" color="text.primary" sx={{ display: 'block', mb: 1 }}>
                    {feedback.comments}
                  </Typography>
                  {feedback.responded && feedback.response && (
                    <Paper sx={{ p: 1, backgroundColor: 'grey.100', mt: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        Response: {feedback.response}
                      </Typography>
                    </Paper>
                  )}
                  {!feedback.responded && (
                    <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
                      <TextField
                        size="small"
                        placeholder="Your response..."
                        value={responses[feedback.id] || ''}
                        onChange={(e) => setResponses({...responses, [feedback.id]: e.target.value})}
                        sx={{ flex: 1 }}
                      />
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => handleRespond(feedback.id)}
                      >
                        Respond
                      </Button>
                    </Box>
                  )}
                </>
              }
            />
          </ListItem>
        ))}
      </List>

      <Box sx={{ mt: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Feedback Summary
        </Typography>
        <Paper sx={{ p: 2 }}>
          <Typography>Total Feedback: {feedbackItems.length}</Typography>
          <Typography>Average Rating: {feedbackItems.reduce((sum, f) => sum + f.rating, 0) / feedbackItems.length || 0} / 5</Typography>
          <Typography>Positive Feedback: {feedbackItems.filter(f => f.rating >= 4).length} ({feedbackItems.length > 0 ? Math.round(feedbackItems.filter(f => f.rating >= 4).length / feedbackItems.length * 100) : 0}%)</Typography>
          <Typography>Needs Attention: {feedbackItems.filter(f => f.rating <= 2).length} ({feedbackItems.length > 0 ? Math.round(feedbackItems.filter(f => f.rating <= 2).length / feedbackItems.length * 100) : 0}%)</Typography>
          <Typography>Response Rate: {feedbackItems.filter(f => f.responded).length} ({feedbackItems.length > 0 ? Math.round(feedbackItems.filter(f => f.responded).length / feedbackItems.length * 100) : 0}%)</Typography>
        </Paper>
      </Box>
    </Box>
  );
};

export default GuestFeedback;

