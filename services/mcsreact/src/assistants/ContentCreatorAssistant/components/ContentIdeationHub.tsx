import React, { useState, useEffect, useCallback } from 'react';
import { Typography, Button, TextField, Box, Card, FormControl, InputLabel, Chip, LinearProgress, CircularProgress, Alert, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material/index.js';
import { Lightbulb as LightbulbIcon, Add as AddIcon, TrendingUp as TrendingUpIcon } from '@mui/icons-material';
import { ContentGoal } from '../types';
import { TrendingTopic, TargetAudience } from '../types';
import { Paper } from '@mui/material/index.js';


interface ContentIdeationHubProps {
  onGenerateIdeas: (goals: ContentGoal[], audience: TargetAudience | null) => void;
  onAnalyzeTrends: (goals: ContentGoal[], audience: TargetAudience | null) => void;
  conversationId: string | null;
  contentGoals: ContentGoal[];
  targetAudience: TargetAudience | null;
  trendingTopics: TrendingTopic[];
  onAddContentGoal: (goal: string) => void;
  onRemoveContentGoal: (index: number) => void;
  onSetTargetAudience: (audience: string) => void;
}

const ContentIdeationHub: React.FC<ContentIdeationHubProps> = ({
  onGenerateIdeas,
  onAnalyzeTrends,
  conversationId,
  contentGoals,
  targetAudience,
  trendingTopics,
  onAddContentGoal,
  onRemoveContentGoal,
  onSetTargetAudience,
}) => {
  const [contentGoalInput, setContentGoalInput] = useState('');
  // Local state for target audience input - only call parent handler on blur/submit
  const [targetAudienceInput, setTargetAudienceInput] = useState(targetAudience?.audience || '');
  const [isLoading, setIsLoading] = useState(false); // Managed by parent now
  const [error, setError] = useState<string | null>(null); // Managed by parent now

  // Sync local state when parent prop changes (e.g., from server response)
  useEffect(() => {
    if (targetAudience?.audience !== undefined) {
      setTargetAudienceInput(targetAudience.audience);
    }
  }, [targetAudience?.audience]);

  const handleAddContentGoalLocal = () => {
    if (contentGoalInput.trim()) {
      onAddContentGoal(contentGoalInput.trim());
      setContentGoalInput('');
    }
  };

  // Only trigger parent callback on blur (when user finishes typing)
  const handleTargetAudienceBlur = () => {
    if (targetAudienceInput.trim() && targetAudienceInput !== targetAudience?.audience) {
      onSetTargetAudience(targetAudienceInput.trim());
    }
  };

  // No longer fetching data directly here, relies on props from parent
  // useEffect is kept for potential future local state or effects not tied to data fetching
  useEffect(() => {
    // Any local effects or setup not related to fetching contentGoals, targetAudience, trendingTopics
    // that are now passed as props.
  }, [conversationId]);


  if (isLoading) { // Use parent's isLoading state if desired, or remove if parent handles all loading
    return (
      <Card sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          <LightbulbIcon color="primary" sx={{ verticalAlign: 'middle', mr: 1 }} />
          Content Ideation Hub
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      </Card>
    );
  }

  if (error) { // Use parent's error state if desired, or remove if parent handles all errors
    return (
      <Card sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          <LightbulbIcon color="primary" sx={{ verticalAlign: 'middle', mr: 1 }} />
          Content Ideation Hub
        </Typography>
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      </Card>
    );
  }

  return (
    <Card sx={{ p: 2, mb: 2 }}>
      <Typography variant="h6" gutterBottom>
        <LightbulbIcon color="primary" sx={{ verticalAlign: 'middle', mr: 1 }} />
        Content Ideation Hub
      </Typography>

      <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
        Content Goals
      </Typography>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
        {contentGoals.map((goal, index) => (
          <Chip key={index} label={goal.goal} onDelete={() => onRemoveContentGoal(index)} />
        ))}
      </Box>

      <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
        <TextField
          fullWidth
          size="small"
          value={contentGoalInput}
          onChange={(e) => setContentGoalInput(e.target.value)}
          placeholder="Add a content goal..."
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddContentGoalLocal();
            }
          }}
        />
        <Button variant="contained" onClick={handleAddContentGoalLocal}>
          Add
        </Button>
      </Box>

      <TextField
        fullWidth
        label="Target Audience"
        value={targetAudienceInput}
        onChange={(e) => setTargetAudienceInput(e.target.value)}
        onBlur={handleTargetAudienceBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleTargetAudienceBlur();
          }
        }}
        sx={{ mb: 3 }}
        placeholder="Describe your target audience..."
      />

      <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
        Trending Topics
      </Typography>

      <TableContainer component={Paper} sx={{ mb: 3 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Topic</TableCell>
              <TableCell>Popularity</TableCell>
              <TableCell>Growth</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {trendingTopics.map((topic, index) => (
              <TableRow key={index}>
                <TableCell>{topic.topic}</TableCell>
                <TableCell>
                  <LinearProgress
                    variant="determinate"
                    value={topic.popularity}
                    sx={{ height: 8, width: 100, mx: 'auto' }}
                  />
                </TableCell>
                <TableCell>{topic.growth}%</TableCell>
                <TableCell>
                  <Button variant="outlined" size="small">
                    Generate Ideas
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Box display="flex" gap={2} sx={{ mt: 2 }}>
        <Button
          variant="contained"
          color="primary"
          onClick={() => onGenerateIdeas(contentGoals, targetAudience)}
          startIcon={<LightbulbIcon />}
        >
          Generate Content Ideas
        </Button>
        <Button
          variant="outlined"
          onClick={() => onAnalyzeTrends(contentGoals, targetAudience)}
          startIcon={<TrendingUpIcon />}
        >
          Analyze Current Trends
        </Button>
      </Box>
    </Card>
  );
};

export default ContentIdeationHub;

