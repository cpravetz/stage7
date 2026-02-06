import React, { useState } from 'react';
import { Box, Typography, Paper, Card, FormControl, InputLabel, Select, MenuItem, TextField, Button, Slider } from '@mui/material/index.js';
import { Event as EventIcon, Add as AddIcon, Folder as FolderIcon } from '@mui/icons-material';
import { EventAssistantMessageBuilder } from '../../utils/AssistantMessageBuilders';

interface EventPlanningHubProps {
  sendMessage: (message: string) => Promise<void>;
}

const EventPlanningHub: React.FC<EventPlanningHubProps> = ({ sendMessage }) => {
  const [eventType, setEventType] = useState('corporate');
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [attendeeCount, setAttendeeCount] = useState(50);
  const [budgetRange, setBudgetRange] = useState([10000, 50000]);

  return (
    <Card sx={{ p: 2, mb: 2 }}>
      <Typography variant="h6" gutterBottom>
        <EventIcon color="primary" sx={{ verticalAlign: 'middle', mr: 1 }} />
        Event Planning Hub
      </Typography>
      
      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel>Event Type</InputLabel>
        <Select
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
          label="Event Type"
        >
          <MenuItem value="corporate">Corporate Conference</MenuItem>
          <MenuItem value="wedding">Wedding</MenuItem>
          <MenuItem value="social">Social Event</MenuItem>
          <MenuItem value="charity">Charity Fundraiser</MenuItem>
          <MenuItem value="product_launch">Product Launch</MenuItem>
        </Select>
      </FormControl>

      <TextField
        fullWidth
        label="Event Name"
        value={eventName}
        onChange={(e) => setEventName(e.target.value)}
        sx={{ mb: 2 }}
        placeholder="e.g., Annual Tech Conference 2026"
      />

      <TextField
        fullWidth
        label="Event Date"
        type="date"
        value={eventDate}
        onChange={(e) => setEventDate(e.target.value)}
        InputLabelProps={{ shrink: true }}
        sx={{ mb: 2 }}
      />

      <Typography gutterBottom sx={{ mt: 2, mb: 1 }}>
        Estimated Attendees: {attendeeCount}
      </Typography>
      <Slider
        value={attendeeCount}
        onChange={(e, value) => setAttendeeCount(value as number)}
        min={10}
        max={1000}
        step={10}
        valueLabelDisplay="auto"
        sx={{ mb: 3 }}
      />

      <Typography gutterBottom sx={{ mt: 2, mb: 1 }}>
        Budget Range: ${budgetRange[0]} - ${budgetRange[1]}
      </Typography>
      <Slider
        value={budgetRange}
        onChange={(e, value) => setBudgetRange(value as number[])}
        min={5000}
        max={500000}
        step={5000}
        valueLabelDisplay="auto"
        sx={{ mb: 3 }}
      />

      <Box display="flex" gap={2} sx={{ mt: 2 }}>
        <Button
          variant="contained"
          color="primary"
          onClick={() => {
            const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
            const msg = EventAssistantMessageBuilder.monitorEvent(missionId, 'client-id', 'conversation-id', `event-${eventName || 'new'}`, { trackBy: 'event' });
            sendMessage(JSON.stringify(msg));
          }}
          startIcon={<AddIcon />}
        >
          Start New Event Plan
        </Button>
        <Button
          variant="outlined"
          onClick={() => {
            const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
            const msg = EventAssistantMessageBuilder.monitorEvent(missionId, 'client-id', 'conversation-id', 'event-template', { trackBy: 'template' });
            sendMessage(JSON.stringify(msg));
          }}
          startIcon={<FolderIcon />}
        >
          Load Template
        </Button>
      </Box>
    </Card>
  );
};

export default EventPlanningHub;


