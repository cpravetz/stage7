import React from 'react';
import { Box, Typography, Paper, List, ListItem, ListItemText, ListItemIcon, Button, IconButton } from '@mui/material/index.js';
import { Lightbulb as LightbulbIcon } from '@mui/icons-material';
import CloseIcon from '@mui/icons-material/Close';

export interface SongInsight {
  id: string;
  type: 'Lyric' | 'Melody' | 'Harmony' | 'Structure' | 'Theme';
  description: string;
}

interface CreativeInsightAlertsProps {
  insights: SongInsight[];
  onGenerateInsights: () => void;
  onAcknowledgeInsight: (insightId: string) => void;
}

const CreativeInsightAlerts: React.FC<CreativeInsightAlertsProps> = ({
  insights = [],
  onGenerateInsights,
  onAcknowledgeInsight
}) => {
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Creative Insight Alerts
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Box sx={{ mb: 2 }}>
          <Button
            variant="contained"
            onClick={onGenerateInsights}
            fullWidth
          >
            Generate New Insights
          </Button>
        </Box>
        <List>
          {insights.map((insight) => (
            <ListItem
              key={insight.id}
              secondaryAction={
                <IconButton
                  edge="end"
                  aria-label="close"
                  onClick={() => onAcknowledgeInsight(insight.id)}
                >
                  <CloseIcon />
                </IconButton>
              }
            >
              <ListItemIcon>
                <LightbulbIcon color="primary" />
              </ListItemIcon>
              <ListItemText
                primary={<Typography variant="subtitle1">{insight.type} Insight</Typography>}
                secondary={insight.description}
              />
            </ListItem>
          ))}
          {insights.length === 0 && (
            <ListItem>
              <ListItemText primary="No insights generated yet. Click 'Generate New Insights' to get started." />
            </ListItem>
          )}
        </List>
      </Paper>
    </Box>
  );
};

export default CreativeInsightAlerts;


