import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, List, ListItem, ListItemText, ListItemIcon, CircularProgress, Alert } from '@mui/material/index.js';
import { Event as EventIcon, CheckCircle as CheckCircleIcon }from '@mui/icons-material';
import { educationAssistantClient } from '../shared/assistantClients'; // Import the client

interface ProgressEvent {
  id: string;
  date: string;
  description: string;
  type: 'Assessment Completed' | 'Milestone Achieved' | 'Resource Engagement' | string; // Added string for flexibility
}

interface StudentProgressTimelineProps {
  conversationId: string | null;
  client: typeof educationAssistantClient;
  setError: (error: string | null) => void;
  selectedStudent: { id: string; name: string } | null; // Assuming student has at least an id and name
}

const StudentProgressTimeline: React.FC<StudentProgressTimelineProps> = ({ conversationId, client, setError, selectedStudent }) => {
  const [progressEvents, setProgressEvents] = useState<ProgressEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProgressEvents = async () => {
      if (!conversationId || !selectedStudent) {
        setProgressEvents([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const contextData = await client.getContext(conversationId);
        const fetchedEvents = contextData.contextItems
          .filter(item => item.type === 'progress_event' && (item as any).studentId === selectedStudent.id) // Assuming 'progress_event' type and studentId field
          .map(item => ({
            id: item.id,
            date: (item as any).date || 'N/A',
            description: item.title,
            type: (item as any).eventType || 'General Event', // Assuming 'eventType' field
          }));
        setProgressEvents(fetchedEvents);
      } catch (err) {
        console.error('Error fetching progress events:', err);
        setError('Failed to load student progress events.');
        setProgressEvents([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProgressEvents();
  }, [conversationId, client, setError, selectedStudent]);

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
        Student Progress Timeline
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <List>
          {selectedStudent === null ? (
            <ListItem>
              <ListItemText primary="Select a student to view their progress timeline." />
            </ListItem>
          ) : progressEvents.length > 0 ? (
            progressEvents.map((event) => (
              <ListItem key={event.id}>
                <ListItemIcon>
                  {event.type === 'Assessment Completed' || event.type === 'Milestone Achieved' ? <CheckCircleIcon color="success" /> : <EventIcon />}
                </ListItemIcon>
                <ListItemText
                  primary={event.description}
                  secondary={`${event.date} - ${event.type}`}
                />
              </ListItem>
            ))
          ) : (
            <ListItem>
              <ListItemText primary="No progress events found for this student." />
            </ListItem>
          )}
        </List>
      </Paper>
    </Box>
  );
};

export default StudentProgressTimeline;


