import React from 'react';
import { Box, Typography, Paper, List, ListItem, ListItemText, ListItemIcon, Button } from '@mui/material/index.js';
import { Timeline as TimelineIcon } from '@mui/icons-material';
import { LyricSection } from './types';

export interface MelodyIdea {
  id: string;
  name: string;
  description: string;
  key?: string;
}

export interface MusicalEvent {
  id: string;
  time: string;
  description: string;
  type: 'Section Change' | 'Key Change' | 'Tempo Change' | 'Instrumentation Change';
}

interface MusicalTimelineProps {
  lyrics: LyricSection[];
  melodies: MelodyIdea[];
  onViewTimeline: () => void;
}

const MusicalTimeline: React.FC<MusicalTimelineProps> = ({
  lyrics = [],
  melodies = [],
  onViewTimeline
}) => {
  // Compute timeline events from lyrics and melodies
  const timelineEvents: MusicalEvent[] = React.useMemo(() => {
    const events: MusicalEvent[] = [];
    let timeCounter = 0;

    // Add lyric section events
    lyrics.forEach((lyric, idx) => {
      events.push({
        id: `lyric-${lyric.id}`,
        time: `${Math.floor(timeCounter / 60)}:${String(timeCounter % 60).padStart(2, '0')}`,
        description: `${lyric.type} - ${lyric.content.substring(0, 30)}...`,
        type: 'Section Change',
      });
      timeCounter += 30; // Assume each section is ~30 seconds
    });

    // Add melody events
    melodies.forEach((melody, idx) => {
      const melodyTime = Math.floor(Math.random() * timeCounter) || 0;
      events.push({
        id: `melody-${melody.id}`,
        time: `${Math.floor(melodyTime / 60)}:${String(melodyTime % 60).padStart(2, '0')}`,
        description: `Melody: ${melody.name}`,
        type: 'Section Change',
      });
    });

    return events.sort((a, b) => a.time.localeCompare(b.time));
  }, [lyrics, melodies]);

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Musical Timeline
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Box sx={{ mb: 2 }}>
          <Button
            variant="contained"
            onClick={onViewTimeline}
            fullWidth
          >
            View Timeline
          </Button>
        </Box>
        <List>
          {timelineEvents.map((event) => (
            <ListItem key={event.id}>
              <ListItemIcon>
                <TimelineIcon />
              </ListItemIcon>
              <ListItemText
                primary={`${event.time} - ${event.description}`}
                secondary={`Type: ${event.type}`}
              />
            </ListItem>
          ))}
          {timelineEvents.length === 0 && (
            <ListItem>
              <ListItemText primary="No timeline events yet. Add lyrics and melodies to generate timeline." />
            </ListItem>
          )}
        </List>
      </Paper>
    </Box>
  );
};

export default MusicalTimeline;


