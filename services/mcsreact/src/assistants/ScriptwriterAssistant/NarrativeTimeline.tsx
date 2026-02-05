import React, { useMemo } from 'react';
import { Timeline, TimelineItem, TimelineSeparator, TimelineConnector, TimelineContent, TimelineOppositeContent} from '@mui/lab';
import { Box, Typography, Paper, Alert } from '@mui/material';
import { Event as EventIcon } from '@mui/icons-material';

interface Character {
  id: string;
  name: string;
  description: string;
  role: string;
}

interface PlotPoint {
  id: string;
  sequenceNumber: number;
  description: string;
  actNumber?: number;
}

interface NarrativeTimelineProps {
  characters: Character[];
  plotPoints: PlotPoint[];
  onViewTimeline: () => void;
}

const NarrativeTimeline: React.FC<NarrativeTimelineProps> = ({
  characters,
  plotPoints,
  onViewTimeline
}) => {
  const sortedPlotPoints = useMemo(() => {
    return [...plotPoints].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  }, [plotPoints]);

  const timelineEvents = useMemo(() => {
    return sortedPlotPoints.map((pp, index) => ({
      ...pp,
      order: index + 1,
      actLabel: pp.actNumber ? `Act ${pp.actNumber}` : 'Unknown'
    }));
  }, [sortedPlotPoints]);

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Narrative Timeline
      </Typography>
      
      <Alert severity="info" sx={{ mb: 3 }}>
        Timeline showing {timelineEvents.length} plot points across {characters.length} characters
      </Alert>

      <Paper elevation={2} sx={{ p: 2 }}>
        {timelineEvents.length === 0 ? (
          <Alert severity="warning">
            No plot points added yet. Create plot points in the Plot Structure tab to see the timeline.
          </Alert>
        ) : (
          <Timeline position="alternate">
            {timelineEvents.map((event, index) => (
              <TimelineItem key={event.id}>
                <TimelineOppositeContent>
                  <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
                    {event.actLabel}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Scene #{event.order}
                  </Typography>
                </TimelineOppositeContent>
                <TimelineSeparator>
                  <EventIcon sx={{ color: '#1976d2' }} />
                  {index < timelineEvents.length - 1 && <TimelineConnector />}
                </TimelineSeparator>
                <TimelineContent>
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                    {event.description}
                  </Typography>
                </TimelineContent>
              </TimelineItem>
            ))}
          </Timeline>
        )}
      </Paper>
    </Box>
  );
};

export default NarrativeTimeline;


