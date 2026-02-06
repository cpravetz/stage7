// services/mcsreact/src/assistants/ProjectManagerAssistant/components/ProjectCalendarAndScheduling.tsx
import React, { useState } from 'react';
import { ListItemAvatar, Avatar, Box, Typography, Card, CardContent, LinearProgress, Chip, Divider, List, ListItem, ListItemText, Grid, Button, Paper, IconButton, Tooltip, TextField, MenuItem, Select, FormControl, InputLabel } from '@mui/material';
import { CalendarEvent } from '../ProjectManagerAssistantPage';
import { Search as SearchIcon, CalendarToday as CalendarTodayIcon, Event as EventIcon, MeetingRoom as MeetingRoomIcon, Work as WorkIcon, Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, Today as TodayIcon, DateRange as DateRangeIcon, AccessTime as AccessTimeIcon, LocationOn as LocationOnIcon, Person as PersonIcon, Download as DownloadIcon } from '@mui/icons-material';

interface ProjectCalendarAndSchedulingProps {
  calendarEvents: CalendarEvent[];
  sendMessage: (message: string) => void;
}

const ProjectCalendarAndScheduling: React.FC<ProjectCalendarAndSchedulingProps> = ({ calendarEvents, sendMessage }) => {
  const [filterType, setFilterType] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const getTypeIcon = (type: 'meeting' | 'deadline' | 'milestone') => {
    switch (type) {
      case 'meeting': return <MeetingRoomIcon fontSize="small" />;
      case 'deadline': return <WorkIcon fontSize="small" />;
      case 'milestone': return <EventIcon fontSize="small" />;
      default: return <EventIcon fontSize="small" />;
    }
  };

  const getTypeColor = (type: 'meeting' | 'deadline' | 'milestone') => {
    switch (type) {
      case 'meeting': return 'secondary';
      case 'deadline': return 'error';
      case 'milestone': return 'success';
      default: return 'default';
    }
  };

  const filteredEvents = calendarEvents.filter(event => {
    const typeMatch = filterType === 'all' || event.type === filterType;
    const searchMatch = event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                       event.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                       event.attendees.some(attendee => attendee.toLowerCase().includes(searchTerm.toLowerCase()));
    return typeMatch && searchMatch;
  });

  const meetings = calendarEvents.filter(e => e.type === 'meeting');
  const deadlines = calendarEvents.filter(e => e.type === 'deadline');
  const milestones = calendarEvents.filter(e => e.type === 'milestone');

  // Get upcoming events (next 7 days)
  const today = new Date();
  const upcomingEvents = calendarEvents.filter(event => {
    const eventDate = new Date(event.start);
    const daysDiff = (eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    return daysDiff >= 0 && daysDiff <= 7;
  });

  return (
    <Box sx={{ p: 2, height: '100%', overflowY: 'auto' }}>
      <Typography variant="h6" gutterBottom fontWeight="bold">
        Project Calendar & Scheduling
      </Typography>

      {/* Filters and Search */}
      <Card elevation={3} sx={{ mb: 3, p: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={5}>
            <TextField
              fullWidth
              label="Search Events"
              variant="outlined"
              size="small"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by title, description, or attendees..."
              InputProps={{
                startAdornment: <SearchIcon color="disabled" sx={{ mr: 1 }} />
              }}
            />
          </Grid>

          <Grid item xs={12} sm={4}>
            <FormControl fullWidth size="small">
              <InputLabel>Event Type</InputLabel>
              <Select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as 'meeting' | 'deadline' | 'milestone' | 'all')}
                label="Event Type"
              >
                <MenuItem value="all">All Types</MenuItem>
                <MenuItem value="meeting">Meetings</MenuItem>
                <MenuItem value="deadline">Deadlines</MenuItem>
                <MenuItem value="milestone">Milestones</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={3}>
            <Button 
              fullWidth
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={() => sendMessage('Schedule new calendar event')}
              size="medium"
            >
              New Event
            </Button>
          </Grid>
        </Grid>
      </Card>

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                Total Events
              </Typography>
              <Typography variant="h4" fontWeight="bold">
                {calendarEvents.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={3}>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                Upcoming
              </Typography>
              <Typography variant="h4" fontWeight="bold" color="warning.main">
                {upcomingEvents.length}
              </Typography>
              <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
                in next 7 days
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={3}>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                Meetings
              </Typography>
              <Typography variant="h4" fontWeight="bold" color="secondary.main">
                {meetings.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={3}>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                Deadlines
              </Typography>
              <Typography variant="h4" fontWeight="bold" color="error.main">
                {deadlines.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Event Type Distribution */}
      <Typography variant="subtitle1" gutterBottom fontWeight="medium">
        Event Type Distribution
      </Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Card elevation={3} sx={{ bgcolor: 'secondary.light' }}>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="subtitle2" color="textSecondary">
                    Meetings
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="secondary.main">
                    {meetings.length}
                  </Typography>
                </Box>
                <MeetingRoomIcon color="secondary" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={4}>
          <Card elevation={3} sx={{ bgcolor: 'error.light' }}>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="subtitle2" color="textSecondary">
                    Deadlines
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="error.main">
                    {deadlines.length}
                  </Typography>
                </Box>
                <WorkIcon color="error" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={4}>
          <Card elevation={3} sx={{ bgcolor: 'success.light' }}>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="subtitle2" color="textSecondary">
                    Milestones
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="success.main">
                    {milestones.length}
                  </Typography>
                </Box>
                <EventIcon color="success" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Upcoming Events */}
      {upcomingEvents.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" gutterBottom fontWeight="medium">
            Upcoming Events (Next 7 Days)
          </Typography>

          <List sx={{ mb: 2 }}>
            {upcomingEvents.map((event) => (
              <React.Fragment key={event.id}>
                <ListItem 
                  alignItems="flex-start"
                  secondaryAction={
                    <Box>
                      <IconButton edge="end" size="small" onClick={() => sendMessage(`Update event ${event.title}`)}> 
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton edge="end" size="small" onClick={() => sendMessage(`Cancel event ${event.title}`)}> 
                        <DeleteIcon fontSize="small" color="error" />
                      </IconButton>
                    </Box>
                  }
                  sx={{ py: 2 }}
                >
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: getTypeColor(event.type) }}>
                      {getTypeIcon(event.type)}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Box display="flex" alignItems="center">
                        <Typography variant="subtitle1" fontWeight="medium" sx={{ mr: 1 }}>
                          {event.title}
                        </Typography>
                        <Chip 
                          label={event.type}
                          color={getTypeColor(event.type)}
                          size="small"
                          sx={{ mr: 1 }}
                        />
                      </Box>
                    }
                    secondary={
                      <Box mt={1}>
                        <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
                          <AccessTimeIcon fontSize="small" color="disabled" sx={{ mr: 0.5 }} />
                          <Typography variant="caption" color="textSecondary">
                            {event.start} - {event.end}
                          </Typography>
                        </Box>

                        {event.location && (
                          <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
                            <LocationOnIcon fontSize="small" color="disabled" sx={{ mr: 0.5 }} />
                            <Typography variant="caption" color="textSecondary">
                              {event.location}
                            </Typography>
                          </Box>
                        )}

                        {event.attendees.length > 0 && (
                          <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
                            <PersonIcon fontSize="small" color="disabled" sx={{ mr: 0.5 }} />
                            <Typography variant="caption" color="textSecondary">
                              {event.attendees.length} attendee(s)
                            </Typography>
                          </Box>
                        )}

                        {event.description && (
                          <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
                            {event.description}
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                </ListItem>
                <Divider component="li" />
              </React.Fragment>
            ))}
          </List>
        </Box>
      )}

      {/* All Events */}
      <Typography variant="subtitle1" gutterBottom fontWeight="medium">
        All Calendar Events ({filteredEvents.length})
      </Typography>

      <List sx={{ mb: 3 }}>
        {filteredEvents.map((event) => (
          <React.Fragment key={event.id}>
            <ListItem 
              alignItems="flex-start"
              secondaryAction={
                <Box>
                  <IconButton edge="end" size="small" onClick={() => sendMessage(`Update event ${event.title}`)}> 
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton edge="end" size="small" onClick={() => setSelectedEvent(event)}> 
                    <CalendarTodayIcon fontSize="small" />
                  </IconButton>
                </Box>
              }
              sx={{ py: 2, cursor: 'pointer' }}
              onClick={() => setSelectedEvent(event)}
            >
              <ListItemAvatar>
                <Avatar sx={{ bgcolor: getTypeColor(event.type) }}>
                  {getTypeIcon(event.type)}
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={
                  <Box display="flex" alignItems="center">
                    <Typography variant="subtitle1" fontWeight="medium" sx={{ mr: 1 }}>
                      {event.title}
                    </Typography>
                    <Chip 
                      label={event.type}
                      color={getTypeColor(event.type)}
                      size="small"
                      sx={{ mr: 1 }}
                    />
                  </Box>
                }
                secondary={
                  <Box mt={1}>
                    <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
                      <AccessTimeIcon fontSize="small" color="disabled" sx={{ mr: 0.5 }} />
                      <Typography variant="caption" color="textSecondary">
                        {event.start} - {event.end}
                      </Typography>
                    </Box>

                    {event.location && (
                      <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
                        <LocationOnIcon fontSize="small" color="disabled" sx={{ mr: 0.5 }} />
                        <Typography variant="caption" color="textSecondary">
                          {event.location}
                        </Typography>
                      </Box>
                    )}

                    {event.attendees.length > 0 && (
                      <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
                        <PersonIcon fontSize="small" color="disabled" sx={{ mr: 0.5 }} />
                        <Typography variant="caption" color="textSecondary">
                          {event.attendees.length} attendee(s)
                        </Typography>
                      </Box>
                    )}

                    {event.description && (
                      <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
                        {event.description}
                      </Typography>
                    )}
                  </Box>
                }
              />
            </ListItem>
            <Divider component="li" />
          </React.Fragment>
        ))}
      </List>

      {/* Selected Event Details */}
      {selectedEvent && (
        <Box sx={{ mt: 3 }}>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle1" gutterBottom fontWeight="medium">
            Event Details
          </Typography>
          <Card elevation={3}>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="start">
                <Box flexGrow={1}>
                  <Typography variant="h6" fontWeight="bold" sx={{ mb: 1 }}>
                    {selectedEvent.title}
                  </Typography>

                  <Box display="flex" alignItems="center" sx={{ mb: 2 }}>
                    <Chip 
                      label={selectedEvent.type}
                      color={getTypeColor(selectedEvent.type)}
                      size="small"
                      sx={{ mr: 1 }}
                    />
                    <Chip 
                      label={`ID: ${selectedEvent.id}`}
                      size="small"
                      variant="outlined"
                    />
                  </Box>

                  {/* Event Information */}
                  <Typography variant="subtitle2" gutterBottom sx={{ mt: 2, mb: 1 }}>
                    Event Information
                  </Typography>

                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" color="textSecondary">
                      Title
                    </Typography>
                    <Typography variant="body1" fontWeight="medium">
                      {selectedEvent.title}
                    </Typography>
                  </Box>

                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" color="textSecondary">
                      Type
                    </Typography>
                    <Typography variant="body2">
                      {selectedEvent.type.charAt(0).toUpperCase() + selectedEvent.type.slice(1)}
                    </Typography>
                  </Box>

                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" color="textSecondary">
                      Date & Time
                    </Typography>
                    <Typography variant="body2">
                      {selectedEvent.start} - {selectedEvent.end}
                    </Typography>
                  </Box>

                  {selectedEvent.location && (
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="caption" color="textSecondary">
                        Location
                      </Typography>
                      <Box display="flex" alignItems="center">
                        <LocationOnIcon fontSize="small" color="disabled" sx={{ mr: 0.5 }} />
                        <Typography variant="body2">
                          {selectedEvent.location}
                        </Typography>
                      </Box>
                    </Box>
                  )}

                  {selectedEvent.description && (
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="caption" color="textSecondary">
                        Description
                      </Typography>
                      <Typography variant="body2">
                        {selectedEvent.description}
                      </Typography>
                    </Box>
                  )}

                  {/* Attendees */}
                  {selectedEvent.attendees.length > 0 && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        Attendees ({selectedEvent.attendees.length})
                      </Typography>
                      <Box display="flex" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
                        {selectedEvent.attendees.map((attendee) => (
                          <Chip 
                            key={attendee}
                            label={attendee}
                            size="small"
                            variant="outlined"
                            avatar={<Avatar><PersonIcon fontSize="small" /></Avatar>}
                          />
                        ))}
                      </Box>
                    </Box>
                  )}

                  {/* Actions */}
                  <Box display="flex" justifyContent="space-between" sx={{ mt: 3 }}>
                    <Button 
                      variant="contained"
                      color="primary"
                      size="small"
                      startIcon={<EditIcon />}
                      onClick={() => sendMessage(`Update event details for ${selectedEvent.title}`)}
                    >
                      Update Event
                    </Button>
                    <Button 
                      variant="outlined"
                      color="secondary"
                      size="small"
                      startIcon={<CalendarTodayIcon />}
                      onClick={() => sendMessage(`Add this event to my calendar: ${selectedEvent.title}`)}
                    >
                      Add to Calendar
                    </Button>
                    <Button 
                      variant="outlined"
                      color="error"
                      size="small"
                      onClick={() => setSelectedEvent(null)}
                    >
                      Close
                    </Button>
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Box>
      )}

      {/* Quick Actions */}
      <Box sx={{ mt: 3 }}>
        <Typography variant="subtitle1" gutterBottom fontWeight="medium">
          Quick Actions
        </Typography>
        <Grid container spacing={1}>
          <Grid item>
            <Button 
              variant="contained"
              color="primary"
              size="small"
              startIcon={<AddIcon />}
              onClick={() => sendMessage('Schedule team meeting')}
            >
              Schedule Meeting
            </Button>
          </Grid>
          <Grid item>
            <Button 
              variant="outlined"
              color="secondary"
              size="small"
              startIcon={<TodayIcon />}
              onClick={() => sendMessage('Show today\'s schedule')}
            >
              Today's Schedule
            </Button>
          </Grid>
          <Grid item>
            <Button 
              variant="outlined"
              color="secondary"
              size="small"
              startIcon={<DownloadIcon />}
              onClick={() => sendMessage('Export calendar to iCal format')}
            >
              Export Calendar
            </Button>
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
};

export default ProjectCalendarAndScheduling;

