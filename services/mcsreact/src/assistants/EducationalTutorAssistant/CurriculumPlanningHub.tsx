import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, List, ListItem, ListItemText, TextField, Button, Grid, Accordion, AccordionSummary, AccordionDetails, FormControl, InputLabel, Select, MenuItem, CircularProgress, Alert } from '@mui/material/index.js';
import {ExpandMore as ExpandMoreIcon}  from '@mui/icons-material';
import { educationAssistantClient } from '../shared/assistantClients'; // Import the client

interface Module {
  id: string;
  title: string;
  topics: string[];
}

interface CurriculumPlanningHubProps {
  conversationId: string | null;
  client: typeof educationAssistantClient;
  setError: (error: string | null) => void;
  // curriculumItems: Module[]; // This prop is no longer needed as the component fetches its own
}

const CurriculumPlanningHub: React.FC<CurriculumPlanningHubProps> = ({ conversationId, client, setError }) => {
  const [modules, setModules] = useState<Module[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newModuleTitle, setNewModuleTitle] = useState<string>('');
  const [newTopic, setNewTopic] = useState<string>('');
  const [currentModuleId, setCurrentModuleId] = useState<string | null>(null);

  useEffect(() => {
    const fetchCurriculum = async () => {
      if (!conversationId) return;

      setIsLoading(true);
      try {
        const contextData = await client.getContext(conversationId);
        const fetchedCurriculum = contextData.contextItems
          .filter(item => item.type === 'curriculum')
          .map(item => ({
            id: item.id,
            title: item.title,
            topics: (item as any).standards || [] // Assuming 'standards' field holds topics
          }));
        setModules(fetchedCurriculum);
      } catch (err) {
        console.error('Error fetching curriculum:', err);
        setError('Failed to load curriculum data.');
        setModules([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchCurriculum();
  }, [conversationId, client, setError]);

  const handleAddModule = async () => {
    if (newModuleTitle) {
      if (!conversationId) {
        setError('No active conversation to add module.');
        return;
      }
      try {
        await client.sendMessage(conversationId, `User wants to create a new curriculum module titled: "${newModuleTitle}".`);
        setError(null);
        // Optimistic UI update
        setModules([...modules, { id: `temp-${Date.now()}`, title: newModuleTitle, topics: [] }]);
        setNewModuleTitle('');
      } catch (err) {
        console.error('Error adding module:', err);
        setError('Failed to request module creation from assistant.');
      }
    }
  };

  const handleAddTopic = async () => {
    if (newTopic && currentModuleId) {
      if (!conversationId) {
        setError('No active conversation to add topic.');
        return;
      }
      try {
        await client.sendMessage(conversationId, `User wants to add topic "${newTopic}" to module ID: "${currentModuleId}".`);
        setError(null);
        // Optimistic UI update
        setModules(modules.map(mod =>
          mod.id === currentModuleId ? { ...mod, topics: [...mod.topics, newTopic] } : mod
        ));
        setNewTopic('');
      } catch (err) {
        console.error('Error adding topic:', err);
        setError('Failed to request topic addition from assistant.');
      }
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ mt: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Curriculum Planning Hub
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Create New Module
            </Typography>
            <TextField
              label="New Module Title"
              fullWidth
              value={newModuleTitle}
              onChange={(e) => setNewModuleTitle(e.target.value)}
              sx={{ mb: 2 }}
            />
            <Button variant="contained" onClick={handleAddModule} fullWidth>
              Add Module
            </Button>

            <Typography variant="h6" gutterBottom sx={{ mt: 4 }}>
              Add Topic to Module
            </Typography>
            <TextField
              label="New Topic"
              fullWidth
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              sx={{ mb: 2 }}
            />
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel id="module-select-label">Select Module</InputLabel>
              <Select
                labelId="module-select-label"
                value={currentModuleId || ''}
                label="Select Module"
                onChange={(e) => setCurrentModuleId(e.target.value as string)}
              >
                {modules.map((mod) => (
                  <MenuItem key={mod.id} value={mod.id}>
                    {mod.title}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button variant="contained" onClick={handleAddTopic} fullWidth disabled={!currentModuleId}>
              Add Topic
            </Button>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Current Curriculum
            </Typography>
            {modules.length > 0 ? (
              modules.map((module) => (
                <Accordion key={module.id}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant="subtitle1">{module.title}</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <List dense>
                      {module.topics.length > 0 ? (
                        module.topics.map((topic, index) => (
                          <ListItem key={index}>
                            <ListItemText primary={topic} />
                          </ListItem>
                        ))
                      ) : (
                        <ListItem>
                          <ListItemText primary="No topics in this module." />
                        </ListItem>
                      )}
                    </List>
                  </AccordionDetails>
                </Accordion>
              ))
            ) : (
              <Typography color="textSecondary" align="center" sx={{ p: 4 }}>
                No curriculum modules found.
              </Typography>
            )}
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default CurriculumPlanningHub;


