import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, TextField, Button, List, ListItem, ListItemText, FormControlLabel, Checkbox, CircularProgress } from '@mui/material/index.js';
import { ImprovementItem } from './types'; // Import from shared types
import { CustomerSupportAssistantClient } from './CustomerSupportAssistantClient'; // Import the client

interface ContinuousImprovementPlannerProps {
  conversationId: string | null;
  client: CustomerSupportAssistantClient;
  setError: (message: string | null) => void;
}

const ContinuousImprovementPlanner: React.FC<ContinuousImprovementPlannerProps> = ({ conversationId, client, setError }) => {
  const [improvementItems, setImprovementItems] = useState<ImprovementItem[]>([]);
  const [newSuggestion, setNewSuggestion] = useState<string>('');
  const [newAction, setNewAction] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  const fetchImprovementItems = async () => {
    if (!conversationId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await client.getImprovementItems(conversationId);
      setImprovementItems(data);
    } catch (err) {
      console.error('Error fetching improvement items:', err);
      setError(`Error fetching improvement items: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchImprovementItems();
  }, [conversationId, client]); // Re-fetch when conversationId or client changes

  const handleToggleComplete = async (id: string, completed: boolean) => {
    if (!conversationId) return;
    try {
      await client.updateImprovementItemStatus(conversationId, id, completed);
      fetchImprovementItems(); // Re-fetch to update the list
    } catch (err) {
      console.error('Error updating improvement item status:', err);
      setError(`Error updating improvement item status: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleAddImprovement = async () => {
    if (newSuggestion && newAction && conversationId) {
      try {
        await client.addImprovementItem(conversationId, newSuggestion, newAction);
        setNewSuggestion('');
        setNewAction('');
        fetchImprovementItems(); // Re-fetch to update the list
      } catch (err) {
        console.error('Error adding improvement item:', err);
        setError(`Error adding improvement item: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ mt: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ ml: 2 }}>Loading Improvement Goals...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Continuous Improvement Planner
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          New Improvement Goal
        </Typography>
        <TextField
          label="Suggestion/Goal"
          fullWidth
          value={newSuggestion}
          onChange={(e) => setNewSuggestion(e.target.value)}
          sx={{ mb: 2 }}
        />
        <TextField
          label="Action Item"
          fullWidth
          value={newAction}
          onChange={(e) => setNewAction(e.target.value)}
          sx={{ mb: 2 }}
        />
        <Button variant="contained" onClick={handleAddImprovement} fullWidth>
          Add Improvement Goal
        </Button>

        <Typography variant="h6" gutterBottom sx={{ mt: 4 }}>
          Current Improvement Goals
        </Typography>
        {improvementItems.length > 0 ? (
          <List>
            {improvementItems.map((item) => (
              <ListItem key={item.id} divider>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={item.completed}
                      onChange={(e) => handleToggleComplete(item.id, e.target.checked)}
                    />
                  }
                  label={
                    <ListItemText
                      primary={item.suggestion}
                      secondary={`Action: ${item.action}`}
                      sx={{ textDecoration: item.completed ? 'line-through' : 'none' }}
                    />
                  }
                />
              </ListItem>
            ))}
          </List>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            No improvement goals found.
          </Typography>
        )}
      </Paper>
    </Box>
  );
};

export default ContinuousImprovementPlanner;


