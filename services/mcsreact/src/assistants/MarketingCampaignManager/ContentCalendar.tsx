import React from 'react';
import { Box, Typography, Paper, Grid, List, ListItem, ListItemText, Button, IconButton } from '@mui/material';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { StaticDatePicker } from '@mui/x-date-pickers';
import dayjs from 'dayjs';
import { CalendarEvent, ContentItem } from './types';
import { Add as AddIcon, Edit as EditIcon } from '@mui/icons-material';

interface ContentCalendarProps {
  calendarEvents: CalendarEvent[];
  contentItems: ContentItem[];
  onCreateEvent: (event: CalendarEvent) => void;
  onUpdateEvent: (id: string, updates: Partial<CalendarEvent>) => void;
  sendMessage: (message: string) => Promise<any>;
}

const ContentCalendar: React.FC<ContentCalendarProps> = ({
  calendarEvents,
  contentItems,
  onCreateEvent,
  onUpdateEvent,
  sendMessage
}) => {
  const [selectedDate, setSelectedDate] = React.useState<dayjs.Dayjs | null>(dayjs());

  const getEventsForDate = (date: dayjs.Dayjs | null) => {
    if (!date) return [];
    return calendarEvents.filter(
      (event) => dayjs(new Date(event.start)).format('YYYY-MM-DD') === date.format('YYYY-MM-DD')
    );
  };

  const getContentForDate = (date: dayjs.Dayjs | null) => {
    if (!date) return [];
    return contentItems.filter(
      (content) => dayjs(new Date(content.publishDate)).format('YYYY-MM-DD') === date.format('YYYY-MM-DD')
    );
  };

  const eventsToday = getEventsForDate(selectedDate);
  const contentToday = getContentForDate(selectedDate);

  const handleCreateEvent = () => {
    const newEvent: CalendarEvent = {
      id: Date.now().toString(),
      title: 'New Event',
      start: selectedDate?.toISOString() || new Date().toISOString(),
      end: selectedDate?.add(1, 'hour').toISOString() || new Date(Date.now() + 3600000).toISOString(),
      type: 'campaign',
      description: ''
    };
    onCreateEvent(newEvent);
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" gutterBottom>
          Content Calendar
        </Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={handleCreateEvent}
        >
          Add Event
        </Button>
      </Box>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <StaticDatePicker
                displayStaticWrapperAs="desktop"
                value={selectedDate}
                onChange={(newValue) => {
                  setSelectedDate(newValue);
                }}
              />
            </LocalizationProvider>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Events for {selectedDate ? selectedDate.format('MMMM D, YYYY') : 'Selected Date'}
            </Typography>
            {eventsToday.length > 0 ? (
              <List>
                {eventsToday.map((event) => (
                  <ListItem key={event.id}>
                    <ListItemText 
                      primary={event.title} 
                      secondary={`${event.type}: ${event.description}`}
                    />
                    <IconButton aria-label="edit" onClick={() => sendMessage(`Edit event ${event.id}`)}>
                      <EditIcon />
                    </IconButton>
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No events scheduled for this date.
              </Typography>
            )}

            <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
              Content for {selectedDate ? selectedDate.format('MMMM D, YYYY') : 'Selected Date'}
            </Typography>
            {contentToday.length > 0 ? (
              <List>
                {contentToday.map((content) => (
                  <ListItem key={content.id}>
                    <ListItemText 
                      primary={content.title} 
                      secondary={`${content.type}: ${content.status}`}
                    />
                    <IconButton aria-label="edit" onClick={() => sendMessage(`Edit content ${content.id}`)}>
                      <EditIcon />
                    </IconButton>
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No content scheduled for this date.
              </Typography>
            )}
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default ContentCalendar;


