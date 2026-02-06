import React from 'react';
import { Box, Typography, Paper, List, ListItem, ListItemText, ListItemIcon, Button, Alert, Chip } from '@mui/material/index.js';
import { Lightbulb as LightbulbIcon, Close as CloseIcon } from '@mui/icons-material';

interface ScriptInsight {
  id: string;
  category: string;
  insight: string;
  timestamp: string;
}

interface CreativeInsightAlertsProps {
  insights: ScriptInsight[];
  onGenerateInsights: () => void;
  onAcknowledgeInsight: (insightId: string) => void;
}

const CreativeInsightAlerts: React.FC<CreativeInsightAlertsProps> = ({
  insights,
  onGenerateInsights,
  onAcknowledgeInsight
}) => {
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Creative Insight Alerts
      </Typography>
      
      <Button
        variant="contained"
        onClick={onGenerateInsights}
        sx={{ mb: 2 }}
      >
        Generate New Insights
      </Button>

      <Paper elevation={2} sx={{ p: 2 }}>
        {insights.length === 0 ? (
          <Alert severity="info">
            No insights yet. Click "Generate New Insights" to analyze your script and get creative recommendations.
          </Alert>
        ) : (
          <List>
            {insights.map((insight) => (
              <ListItem key={insight.id} divider>
                <ListItemIcon>
                  <LightbulbIcon color="warning" />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="subtitle1">{insight.category}</Typography>
                      <Chip label={insight.timestamp} size="small" variant="outlined" />
                    </Box>
                  }
                  secondary={insight.insight}
                />
              </ListItem>
            ))}
          </List>
        )}
      </Paper>
    </Box>
  );
};

export default CreativeInsightAlerts;


