import React from 'react';
import { Box, Typography, Paper, List, ListItem, ListItemText, ListItemIcon } from '@mui/material/index.js';
import {Lightbulb as LightbulbIcon} from '@mui/icons-material';
import {CheckCircle as CheckCircleIcon} from '@mui/icons-material';

interface CoachingInsight {
  id: string;
  category: 'Self-Awareness' | 'Leadership Style' | 'Interpersonal' | 'Strategic';
  insight: string;
  recommendation: string;
}

const mockCoachingInsights: CoachingInsight[] = [
  { id: '1', category: 'Self-Awareness', insight: 'You tend to internalize feedback, which can lead to self-doubt.', recommendation: 'Practice journaling after receiving feedback to process emotions constructively.' },
  { id: '2', category: 'Leadership Style', insight: 'Your direct communication style can sometimes be perceived as abrupt by junior team members.', recommendation: 'Employ more "sandwich feedback" (positive-constructive-positive) when delivering critical feedback.' },
  { id: '3', category: 'Strategic', insight: 'You spend significant time on operational details, potentially at the expense of long-term strategic planning.', recommendation: 'Delegate more operational tasks and block dedicated time for strategic thinking each week.' },
];

const CoachingInsightSystem = () => {
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Coaching Insight System
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <List>
          {mockCoachingInsights.map((insight) => (
            <ListItem key={insight.id}>
              <ListItemIcon>
                <LightbulbIcon color="action" />
              </ListItemIcon>
              <ListItemText
                primary={<Typography variant="subtitle1">{insight.insight}</Typography>}
                secondary={
                  <React.Fragment>
                    <Typography component="span" variant="body2" color="text.primary">
                      Category: {insight.category}
                    </Typography>
                    <br />
                    <Typography component="span" variant="body2" color="text.secondary">
                      Recommendation: {insight.recommendation}
                    </Typography>
                  </React.Fragment>
                }
              />
            </ListItem>
          ))}
        </List>

        <Typography variant="h6" gutterBottom sx={{ mt: 4 }}>
          Actionable Steps for Growth
        </Typography>
        <List>
          <ListItem>
            <ListItemIcon><CheckCircleIcon color="success" /></ListItemIcon>
            <ListItemText primary="Schedule weekly 1-on-1s with direct reports for open feedback." />
          </ListItem>
          <ListItem>
            <ListItemIcon><CheckCircleIcon color="success" /></ListItemIcon>
            <ListItemText primary="Read 'The 7 Habits of Highly Effective People' for leadership principles." />
          </ListItem>
        </List>
      </Paper>
    </Box>
  );
};

export default CoachingInsightSystem;


