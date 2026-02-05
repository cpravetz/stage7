import React from 'react';
import { Box, Typography, Paper, Grid, List, ListItem, ListItemText } from '@mui/material';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { StaticDatePicker } from '@mui/x-date-pickers';
import dayjs from 'dayjs';
import { ScheduledContent } from '@cktmcs/sdk'; // Import from SDK types

interface ContentCalendarProps {
  scheduledContent: ScheduledContent[];
}

const ContentCalendar: React.FC<ContentCalendarProps> = ({ scheduledContent }) => {
  const [selectedDate, setSelectedDate] = React.useState<dayjs.Dayjs | null>(dayjs());

  const getEventsForDate = (date: dayjs.Dayjs | null) => {
    if (!date) return [];
    return scheduledContent.filter( // Use the prop here
      (content) => dayjs(new Date(content.date)).format('YYYY-MM-DD') === date.format('YYYY-MM-DD')
    );
  };

  const eventsToday = getEventsForDate(selectedDate);

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Content Calendar
      </Typography>
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
                {eventsToday.map((event, index) => (
                  <ListItem key={index}>
                    <ListItemText primary={event.title} secondary={`Platform: ${event.platform}`} />
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


