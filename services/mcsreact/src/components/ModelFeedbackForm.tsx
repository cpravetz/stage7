import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Rating,
  TextField,
  Button,
  Snackbar,
  Alert,
  Grid,
  Divider
} from '@mui/material';
import { API_BASE_URL } from '../config';
import { SecurityClient } from '../SecurityClient';

interface ModelFeedbackFormProps {
  modelName: string;
  requestId: string;
  prompt: string;
  response: string;
  conversationType: string;
  onFeedbackSubmitted?: () => void;
}

const ModelFeedbackForm: React.FC<ModelFeedbackFormProps> = ({
  modelName,
  requestId,
  prompt,
  response,
  conversationType,
  onFeedbackSubmitted
}) => {
  const [relevance, setRelevance] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [helpfulness, setHelpfulness] = useState<number | null>(null);
  const [creativity, setCreativity] = useState<number | null>(null);
  const [overall, setOverall] = useState<number | null>(null);
  const [comments, setComments] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!relevance || !accuracy || !helpfulness || !creativity || !overall) {
      setError('Please provide ratings for all categories');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Use SecurityClient for authenticated API calls
      const securityClient = SecurityClient.getInstance(API_BASE_URL);
      await securityClient.getApi().post(`/brain/evaluations`, {
        modelName,
        conversationType,
        requestId,
        prompt,
        response,
        scores: {
          relevance,
          accuracy,
          helpfulness,
          creativity,
          overall
        },
        comments
      });

      setSuccess(true);
      setLoading(false);

      // Reset form
      setRelevance(null);
      setAccuracy(null);
      setHelpfulness(null);
      setCreativity(null);
      setOverall(null);
      setComments('');

      // Notify parent component
      if (onFeedbackSubmitted) {
        onFeedbackSubmitted();
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
      setError('Failed to submit feedback. Please try again later.');
      setLoading(false);
    }
  };

  const handleCloseSnackbar = () => {
    setSuccess(false);
    setError(null);
  };

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        Provide Feedback on Model Response
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Your feedback helps improve model selection and performance.
      </Typography>

      <Divider sx={{ my: 2 }} />

      <Box component="form" onSubmit={handleSubmit}>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <Typography variant="subtitle2" gutterBottom>
              Model: {modelName}
            </Typography>
          </Grid>

          <Grid item xs={12} sm={6}>
            <Box sx={{ mb: 2 }}>
              <Typography component="legend">Relevance</Typography>
              <Rating
                name="relevance"
                value={relevance}
                onChange={(event, newValue) => {
                  setRelevance(newValue);
                }}
                precision={0.5}
              />
            </Box>
          </Grid>

          <Grid item xs={12} sm={6}>
            <Box sx={{ mb: 2 }}>
              <Typography component="legend">Accuracy</Typography>
              <Rating
                name="accuracy"
                value={accuracy}
                onChange={(event, newValue) => {
                  setAccuracy(newValue);
                }}
                precision={0.5}
              />
            </Box>
          </Grid>

          <Grid item xs={12} sm={6}>
            <Box sx={{ mb: 2 }}>
              <Typography component="legend">Helpfulness</Typography>
              <Rating
                name="helpfulness"
                value={helpfulness}
                onChange={(event, newValue) => {
                  setHelpfulness(newValue);
                }}
                precision={0.5}
              />
            </Box>
          </Grid>

          <Grid item xs={12} sm={6}>
            <Box sx={{ mb: 2 }}>
              <Typography component="legend">Creativity</Typography>
              <Rating
                name="creativity"
                value={creativity}
                onChange={(event, newValue) => {
                  setCreativity(newValue);
                }}
                precision={0.5}
              />
            </Box>
          </Grid>

          <Grid item xs={12}>
            <Box sx={{ mb: 2 }}>
              <Typography component="legend">Overall</Typography>
              <Rating
                name="overall"
                value={overall}
                onChange={(event, newValue) => {
                  setOverall(newValue);
                }}
                size="large"
                precision={0.5}
              />
            </Box>
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Comments"
              multiline
              rows={3}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              margin="normal"
            />
          </Grid>

          <Grid item xs={12}>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={loading}
              sx={{ mt: 2 }}
            >
              {loading ? 'Submitting...' : 'Submit Feedback'}
            </Button>
          </Grid>
        </Grid>
      </Box>

      <Snackbar open={success} autoHideDuration={6000} onClose={handleCloseSnackbar}>
        <Alert onClose={handleCloseSnackbar} severity="success" sx={{ width: '100%' }}>
          Feedback submitted successfully!
        </Alert>
      </Snackbar>

      <Snackbar open={!!error} autoHideDuration={6000} onClose={handleCloseSnackbar}>
        <Alert onClose={handleCloseSnackbar} severity="error" sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>
    </Paper>
  );
};

export default ModelFeedbackForm;
