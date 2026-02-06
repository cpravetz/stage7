// services/mcsreact/src/assistants/ProjectManagerAssistant/components/StakeholderCommunicationHub.tsx
import React, { useState } from 'react';
import { Box, Typography, Card, CardContent, LinearProgress, Chip, Divider, List, ListItem, ListItemText, ListItemAvatar, Avatar, Grid, Button, Paper, IconButton, Tooltip, TextField, MenuItem, Select, FormControl, InputLabel } from '@mui/material';
import { StakeholderCommunication } from '../ProjectManagerAssistantPage';
import { Email as EmailIcon, MeetingRoom as MeetingRoomIcon, Description as DescriptionIcon, Person as PersonIcon, CalendarToday as CalendarTodayIcon, PriorityHigh as PriorityHighIcon, CheckCircle as CheckCircleIcon, Warning as WarningIcon, Add as AddIcon, Edit as EditIcon, Search as SearchIcon, Download as DownloadIcon } from '@mui/icons-material';

interface StakeholderCommunicationHubProps {
  stakeholderCommunications: StakeholderCommunication[];
  sendMessage: (message: string) => void;
}

const StakeholderCommunicationHub: React.FC<StakeholderCommunicationHubProps> = ({ stakeholderCommunications, sendMessage }) => {
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCommunication, setSelectedCommunication] = useState<StakeholderCommunication | null>(null);

  const getTypeIcon = (type: 'meeting' | 'email' | 'report') => {
    switch (type) {
      case 'meeting': return <MeetingRoomIcon fontSize="small" />;
      case 'email': return <EmailIcon fontSize="small" />;
      case 'report': return <DescriptionIcon fontSize="small" />;
      default: return <DescriptionIcon fontSize="small" />;
    }
  };

  const getTypeColor = (type: 'meeting' | 'email' | 'report'): 'secondary' | 'primary' | 'info' | 'success' | 'warning' | 'error' | 'default' => {
    switch (type) {
      case 'meeting': return 'secondary';
      case 'email': return 'primary';
      case 'report': return 'info';
      default: return 'default';
    }
  };

  const getStatusColor = (status: string): 'secondary' | 'primary' | 'info' | 'success' | 'warning' | 'error' | 'default' => {
    switch (status.toLowerCase()) {
      case 'completed': return 'success';
      case 'pending': return 'warning';
      case 'scheduled': return 'info';
      case 'overdue': return 'error';
      default: return 'default';
    }
  };

  const getStatusColorForProgress = (status: string): 'secondary' | 'primary' | 'info' | 'success' | 'warning' | 'error' | 'inherit' => {
    switch (status.toLowerCase()) {
      case 'completed': return 'success';
      case 'pending': return 'warning';
      case 'scheduled': return 'info';
      case 'overdue': return 'error';
      default: return 'inherit';
    }
  };

  const getPriorityColor = (priority: 'low' | 'medium' | 'high'): 'secondary' | 'primary' | 'info' | 'success' | 'warning' | 'error' | 'default' => {
    switch (priority) {
      case 'high': return 'error';
      case 'medium': return 'warning';
      case 'low': return 'info';
      default: return 'default';
    }
  };

  const filteredCommunications = stakeholderCommunications.filter(comm => {
    const typeMatch = filterType === 'all' || comm.type === filterType;
    const statusMatch = filterStatus === 'all' || comm.status.toLowerCase() === filterStatus;
    const priorityMatch = filterPriority === 'all' || comm.priority === filterPriority;
    const searchMatch = comm.stakeholder.toLowerCase().includes(searchTerm.toLowerCase()) ||
                       comm.subject.toLowerCase().includes(searchTerm.toLowerCase());
    return typeMatch && statusMatch && priorityMatch && searchMatch;
  });

  const highPriorityItems = stakeholderCommunications.filter(c => c.priority === 'high');
  const pendingItems = stakeholderCommunications.filter(c => c.status.toLowerCase() === 'pending');
  const overdueItems = stakeholderCommunications.filter(c => c.status.toLowerCase() === 'overdue');
  const completedItems = stakeholderCommunications.filter(c => c.status.toLowerCase() === 'completed');

  const meetings = stakeholderCommunications.filter(c => c.type === 'meeting');
  const emails = stakeholderCommunications.filter(c => c.type === 'email');
  const reports = stakeholderCommunications.filter(c => c.type === 'report');

  return (
    <Box sx={{ p: 2, height: '100%', overflowY: 'auto' }}>
      <Typography variant="h6" gutterBottom fontWeight="bold">
        Stakeholder Communication Hub
      </Typography>

      {/* Filters and Search */}
      <Card elevation={3} sx={{ mb: 3, p: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label="Search Communications"
              variant="outlined"
              size="small"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by stakeholder or subject..."
              InputProps={{
                startAdornment: <SearchIcon color="disabled" sx={{ mr: 1 }} />
              }}
            />
          </Grid>

          <Grid item xs={12} sm={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Type</InputLabel>
              <Select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as 'meeting' | 'email' | 'report' | 'all')}
                label="Type"
              >
                <MenuItem value="all">All Types</MenuItem>
                <MenuItem value="meeting">Meetings</MenuItem>
                <MenuItem value="email">Emails</MenuItem>
                <MenuItem value="report">Reports</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as string)}
                label="Status"
              >
                <MenuItem value="all">All Statuses</MenuItem>
                <MenuItem value="pending">Pending</MenuItem>
                <MenuItem value="scheduled">Scheduled</MenuItem>
                <MenuItem value="completed">Completed</MenuItem>
                <MenuItem value="overdue">Overdue</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Priority</InputLabel>
              <Select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value as 'low' | 'medium' | 'high' | 'all')}
                label="Priority"
              >
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="high">High</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
                <MenuItem value="low">Low</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={1}>
            <Button 
              fullWidth
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={() => sendMessage('Schedule new stakeholder communication')}
              size="medium"
            >
              New
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
                Total Items
              </Typography>
              <Typography variant="h4" fontWeight="bold">
                {stakeholderCommunications.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={3}>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                High Priority
              </Typography>
              <Typography variant="h4" fontWeight="bold" color="error.main">
                {highPriorityItems.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={3}>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                Pending
              </Typography>
              <Typography variant="h4" fontWeight="bold" color="warning.main">
                {pendingItems.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={3}>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                Completed
              </Typography>
              <Typography variant="h4" fontWeight="bold" color="success.main">
                {completedItems.length}
              </Typography>
              <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
                {Math.round((completedItems.length / stakeholderCommunications.length) * 100 || 0)}% completion
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Communication Type Distribution */}
      <Typography variant="subtitle1" gutterBottom fontWeight="medium">
        Communication Type Distribution
      </Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Card elevation={3} sx={{ bgcolor: 'primary.light' }}>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="subtitle2" color="textSecondary">
                    Emails
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="primary.main">
                    {emails.length}
                  </Typography>
                </Box>
                <EmailIcon color="primary" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

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
          <Card elevation={3} sx={{ bgcolor: 'info.light' }}>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="subtitle2" color="textSecondary">
                    Reports
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="info.main">
                    {reports.length}
                  </Typography>
                </Box>
                <DescriptionIcon color="info" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Communication List */}
      <Typography variant="subtitle1" gutterBottom fontWeight="medium">
        Stakeholder Communications ({filteredCommunications.length})
      </Typography>

      {overdueItems.length > 0 && (
        <Box sx={{ mb: 2, p: 1, bgcolor: 'error.light', borderRadius: 1 }}>
          <Typography variant="caption" color="error" fontWeight="medium">
            {overdueItems.length} communication(s) are overdue and need immediate attention
          </Typography>
        </Box>
      )}

      <List sx={{ mb: 3 }}>
        {filteredCommunications.map((comm) => (
          <React.Fragment key={comm.id}>
            <ListItem 
              alignItems="flex-start"
              secondaryAction={
                <Box>
                  <IconButton edge="end" size="small" onClick={() => sendMessage(`Update communication status for ${comm.subject}`)}> 
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton edge="end" size="small" onClick={() => setSelectedCommunication(comm)}> 
                    <EmailIcon fontSize="small" />
                  </IconButton>
                </Box>
              }
              sx={{ py: 2, cursor: 'pointer' }}
              onClick={() => setSelectedCommunication(comm)}
            >
              <ListItemAvatar>
                <Avatar sx={{ bgcolor: getTypeColor(comm.type) }}>
                  {getTypeIcon(comm.type)}
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={
                  <Box display="flex" alignItems="center">
                    <Typography variant="subtitle1" fontWeight="medium" sx={{ mr: 1 }}>
                      {comm.subject}
                    </Typography>
                    <Chip 
                      label={comm.type}
                      color={getTypeColor(comm.type)}
                      size="small"
                      sx={{ mr: 1 }}
                    />
                    <Chip 
                      label={comm.status}
                      color={getStatusColor(comm.status)}
                      size="small"
                      sx={{ mr: 1 }}
                    />
                    <Chip 
                      label={comm.priority}
                      color={getPriorityColor(comm.priority)}
                      size="small"
                    />
                  </Box>
                }
                secondary={
                  <Box mt={1}>
                    <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
                      <PersonIcon fontSize="small" color="disabled" sx={{ mr: 0.5 }} />
                      <Typography variant="caption" color="textSecondary">
                        {comm.stakeholder}
                      </Typography>
                    </Box>

                    <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
                      <CalendarTodayIcon fontSize="small" color="disabled" sx={{ mr: 0.5 }} />
                      <Typography variant="caption" color="textSecondary">
                        {comm.date}
                      </Typography>
                    </Box>

                    {/* Status Progress */}
                    <LinearProgress
                      variant="determinate"
                      value={comm.status.toLowerCase() === 'completed' ? 100 : comm.status.toLowerCase() === 'scheduled' ? 50 : comm.status.toLowerCase() === 'pending' ? 25 : 0}
                      sx={{ height: 4, borderRadius: 2, mt: 1 }}
                      color={getStatusColorForProgress(comm.status)}
                    />
                  </Box>
                }
              />
            </ListItem>
            <Divider component="li" />
          </React.Fragment>
        ))}
      </List>

      {/* Selected Communication Details */}
      {selectedCommunication && (
        <Box sx={{ mt: 3 }}>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle1" gutterBottom fontWeight="medium">
            Communication Details
          </Typography>
          <Card elevation={3}>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="start">
                <Box flexGrow={1}>
                  <Typography variant="h6" fontWeight="bold" sx={{ mb: 1 }}>
                    {selectedCommunication.subject}
                  </Typography>

                  <Box display="flex" alignItems="center" sx={{ mb: 2 }}>
                    <Chip 
                      label={selectedCommunication.type}
                      color={getTypeColor(selectedCommunication.type)}
                      size="small"
                      sx={{ mr: 1 }}
                    />
                    <Chip 
                      label={selectedCommunication.status}
                      color={getStatusColor(selectedCommunication.status)}
                      size="small"
                      sx={{ mr: 1 }}
                    />
                    <Chip 
                      label={selectedCommunication.priority}
                      color={getPriorityColor(selectedCommunication.priority)}
                      size="small"
                      sx={{ mr: 1 }}
                    />
                    <Typography variant="body2" color="textSecondary" sx={{ ml: 1 }}>
                      {selectedCommunication.date}
                    </Typography>
                  </Box>

                  {/* Stakeholder Information */}
                  <Typography variant="subtitle2" gutterBottom sx={{ mt: 2, mb: 1 }}>
                    Stakeholder Information
                  </Typography>
                  <Box display="flex" alignItems="center" sx={{ mb: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid #e0e0e0' }}>
                    <Avatar sx={{ width: 32, height: 32, mr: 2, bgcolor: 'primary.main' }}>
                      <PersonIcon fontSize="small" />
                    </Avatar>
                    <Box>
                      <Typography variant="body1" fontWeight="medium">
                        {selectedCommunication.stakeholder}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        {selectedCommunication.type === 'meeting' ? 'Meeting Participant' : selectedCommunication.type === 'email' ? 'Email Recipient' : 'Report Recipient'}
                      </Typography>
                    </Box>
                  </Box>

                  {/* Communication Details */}
                  <Typography variant="subtitle2" gutterBottom sx={{ mt: 2, mb: 1 }}>
                    Communication Details
                  </Typography>

                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" color="textSecondary">
                      Type
                    </Typography>
                    <Typography variant="body2">
                      {selectedCommunication.type.charAt(0).toUpperCase() + selectedCommunication.type.slice(1)}
                    </Typography>
                  </Box>

                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" color="textSecondary">
                      Subject
                    </Typography>
                    <Typography variant="body2" fontWeight="medium">
                      {selectedCommunication.subject}
                    </Typography>
                  </Box>

                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" color="textSecondary">
                      Date
                    </Typography>
                    <Typography variant="body2">
                      {selectedCommunication.date}
                    </Typography>
                  </Box>

                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" color="textSecondary">
                      Status
                    </Typography>
                    <Chip 
                      label={selectedCommunication.status}
                      color={getStatusColor(selectedCommunication.status)}
                      size="small"
                    />
                  </Box>

                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" color="textSecondary">
                      Priority
                    </Typography>
                    <Chip 
                      label={selectedCommunication.priority}
                      color={getPriorityColor(selectedCommunication.priority)}
                      size="small"
                    />
                  </Box>

                  {/* Status Progress */}
                  <Typography variant="subtitle2" gutterBottom sx={{ mt: 2, mb: 1 }}>
                    Communication Progress
                  </Typography>

                  <LinearProgress
                    variant="determinate"
                    value={selectedCommunication.status.toLowerCase() === 'completed' ? 100 : selectedCommunication.status.toLowerCase() === 'scheduled' ? 50 : selectedCommunication.status.toLowerCase() === 'pending' ? 25 : 0}
                    sx={{ height: 8, borderRadius: 4, mb: 1 }}
                    color={getStatusColorForProgress(selectedCommunication.status)}
                  />

                  <Box display="flex" justifyContent="space-between">
                    <Typography variant="caption" color="textSecondary">
                      Pending
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      Scheduled
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      Completed
                    </Typography>
                  </Box>

                  {/* Actions */}
                  <Box display="flex" justifyContent="space-between" sx={{ mt: 3 }}>
                    <Button 
                      variant="contained"
                      color="primary"
                      size="small"
                      startIcon={<CheckCircleIcon />}
                      onClick={() => sendMessage(`Mark communication as completed: ${selectedCommunication.subject}`)}
                    >
                      Mark Completed
                    </Button>
                    <Button 
                      variant="outlined"
                      color="secondary"
                      size="small"
                      startIcon={<EditIcon />}
                      onClick={() => sendMessage(`Update communication details for: ${selectedCommunication.subject}`)}
                    >
                      Update Details
                    </Button>
                    <Button 
                      variant="outlined"
                      color="error"
                      size="small"
                      onClick={() => setSelectedCommunication(null)}
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
              onClick={() => sendMessage('Schedule meeting with stakeholders')}
            >
              Schedule Meeting
            </Button>
          </Grid>
          <Grid item>
            <Button 
              variant="outlined"
              color="secondary"
              size="small"
              startIcon={<EmailIcon />}
              onClick={() => sendMessage('Draft email to stakeholders')}
            >
              Draft Email
            </Button>
          </Grid>
          <Grid item>
            <Button 
              variant="outlined"
              color="secondary"
              size="small"
              startIcon={<DownloadIcon />}
              onClick={() => sendMessage('Generate stakeholder communication report')}
            >
              Generate Report
            </Button>
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
};

export default StakeholderCommunicationHub;

