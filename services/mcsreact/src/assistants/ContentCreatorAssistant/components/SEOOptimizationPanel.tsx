import React, { useState } from 'react';
import { Box, Typography, Paper, TextField, Button, List, ListItem, ListItemText, LinearProgress, Chip, ListItemIcon } from '@mui/material/index.js';
import { CheckCircle as CheckCircleIcon, Warning as WarningIcon, Error as ErrorIcon } from '@mui/icons-material';
import { contentCreatorAssistantClient } from '../../shared/assistantClients';
import { SeoMetrics, SeoSuggestion } from '../types'; // Import from SDK

interface SEOOptimizationPanelProps {
  conversationId: string | null;
  seoMetrics: SeoMetrics[];
  seoSuggestions: SeoSuggestion[];
}

const getStatusIcon = (type: 'optimization' | 'warning' | 'error') => {
  switch (type) {
    case 'optimization': return <CheckCircleIcon color="success" />;
    case 'warning': return <WarningIcon color="warning" />;
    case 'error': return <ErrorIcon color="error" />;
    default: return null;
  }
};

const SEOOptimizationPanel: React.FC<SEOOptimizationPanelProps> = ({ conversationId, seoMetrics, seoSuggestions }) => {
  const [contentToAnalyze, setContentToAnalyze] = useState<string>('');
  const [analysisLoading, setAnalysisLoading] = useState<boolean>(false);
  // analysisResults state removed, now using props.seoMetrics and props.seoSuggestions
  const [error, setError] = useState<string | null>(null);

  const handleAnalyzeSEO = async () => {
    if (!conversationId || !contentToAnalyze.trim()) {
      setError('Conversation ID and content to analyze are required.');
      return;
    }

    setAnalysisLoading(true);
    setError(null);
    try {
      // Send message to the assistant to analyze SEO
      await contentCreatorAssistantClient.sendMessage(conversationId, `Analyze the SEO of the following content: ${contentToAnalyze}`);
      // The parent component (ContentCreatorAssistantPage) will update seoMetrics and seoSuggestions
      // via the message parsing logic from tool outputs.
      // No need to set analysis results here.
    } catch (err) {
      console.error('Error analyzing SEO:', err);
      setError('Failed to analyze SEO. Please try again.');
    } finally {
      setAnalysisLoading(false);
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        SEO Optimization Panel
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <TextField
          label="Content to Analyze (e.g., Blog Post, Webpage Text)"
          multiline
          rows={6}
          fullWidth
          value={contentToAnalyze}
          onChange={(e) => setContentToAnalyze(e.target.value)}
          variant="outlined"
          sx={{ mb: 2 }}
        />
        <Button variant="contained" onClick={handleAnalyzeSEO} disabled={analysisLoading} fullWidth>
          {analysisLoading ? <LinearProgress sx={{ width: '100%' }} /> : 'Analyze SEO'}
        </Button>
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

        {(seoMetrics.length > 0 || seoSuggestions.length > 0) && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="h6" gutterBottom>
              Analysis Results
            </Typography>
            {seoMetrics.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle1">SEO Metrics:</Typography>
                <List>
                  {seoMetrics.map((metric) => (
                    <ListItem key={metric.id} divider>
                      <ListItemText
                        primary={<Typography variant="subtitle2">{metric.keyword}</Typography>}
                        secondary={`Ranking: ${metric.ranking}, Search Volume: ${metric.searchVolume}, Difficulty: ${metric.difficulty}`}
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}

            {seoSuggestions.length > 0 && (
              <Box>
                <Typography variant="subtitle1">SEO Suggestions:</Typography>
                <List>
                  {seoSuggestions.map((suggestion) => (
                    <ListItem key={suggestion.id} divider>
                      <ListItemText
                        primary={<Typography variant="subtitle2">{suggestion.suggestion}</Typography>}
                        secondary={`Impact: ${suggestion.impact}, Difficulty: ${suggestion.difficulty}`}
                      />
                      <Chip label={suggestion.impact} color={suggestion.impact === 'High' ? 'success' : (suggestion.impact === 'Medium' ? 'warning' : 'default')} size="small" sx={{ mr: 1 }} />
                      <Chip label={suggestion.difficulty} color={suggestion.difficulty === 'Hard' ? 'error' : (suggestion.difficulty === 'Medium' ? 'warning' : 'success')} size="small" />
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}
          </Box>
        )}
      </Paper>
    </Box>
  );
};

export default SEOOptimizationPanel;


