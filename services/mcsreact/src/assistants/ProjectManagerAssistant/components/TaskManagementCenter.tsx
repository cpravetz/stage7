// services/mcsreact/src/assistants/ProjectManagerAssistant/components/TaskManagementCenter.tsx
import React, { useState } from 'react';
import { Box, Typography, Card, CardContent, LinearProgress, Chip, Divider, List, ListItem, ListItemText, ListItemAvatar, Avatar, Grid, Button, TextField, MenuItem, Select, FormControl, InputLabel, Checkbox, FormControlLabel, IconButton } from '@mui/material';
import { Task } from '../ProjectManagerAssistantPage';
import { Add as AddIcon, Check as CheckIcon, Edit as EditIcon, Delete as DeleteIcon, Person as PersonIcon, CalendarToday as CalendarTodayIcon, PriorityHigh as PriorityHighIcon } from '@mui/icons-material';

interface TaskManagementCenterProps {
  tasks: Task[];
  sendMessage: (message: string) => void;
}

const TaskManagementCenter: React.FC<TaskManagementCenterProps> = ({ tasks, sendMessage }) => {
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed': return 'success';
      case 'in progress': return 'primary';
      case 'not started': return 'default';
      case 'blocked': return 'error';
      case 'on hold': return 'warning';
      default: return 'default';
    }
  };

  const getPriorityColor = (priority: 'low' | 'medium' | 'high') => {
    switch (priority) {
      case 'high': return 'error';
      case 'medium': return 'warning';
      case 'low': return 'info';
      default: return 'default';
    }
  };

  const filteredTasks = tasks.filter(task => {
    const statusMatch = filterStatus === 'all' || task.status.toLowerCase() === filterStatus;
    const priorityMatch = filterPriority === 'all' || task.priority === filterPriority;
    const searchMatch = task.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                       task.assignedTo.toLowerCase().includes(searchTerm.toLowerCase());
    return statusMatch && priorityMatch && searchMatch;
  });

  const inProgressTasks = filteredTasks.filter(t => t.status.toLowerCase() === 'in progress');
  const completedTasks = filteredTasks.filter(t => t.status.toLowerCase() === 'completed');
  const blockedTasks = filteredTasks.filter(t => t.status.toLowerCase() === 'blocked');
  const highPriorityTasks = filteredTasks.filter(t => t.priority === 'high');

  return (
    <Box sx={{ p: 2, height: '100%', overflowY: 'auto' }}>
      <Typography variant="h6" gutterBottom fontWeight="bold">
        Task Management Center
      </Typography>

      {/* Filters and Search */}
      <Card elevation={3} sx={{ mb: 3, p: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label="Search Tasks"
              variant="outlined"
              size="small"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name or assignee..."
            />
          </Grid>

          <Grid item xs={12} sm={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as string)}
                label="Status"
              >
                <MenuItem value="all">All Statuses</MenuItem>
                <MenuItem value="not started">Not Started</MenuItem>
                <MenuItem value="in progress">In Progress</MenuItem>
                <MenuItem value="completed">Completed</MenuItem>
                <MenuItem value="blocked">Blocked</MenuItem>
                <MenuItem value="on hold">On Hold</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Priority</InputLabel>
              <Select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value as 'low' | 'medium' | 'high' | 'all')}
                label="Priority"
              >
                <MenuItem value="all">All Priorities</MenuItem>
                <MenuItem value="high">High</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
                <MenuItem value="low">Low</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={2}>
            <Button 
              fullWidth
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={() => sendMessage('Create a new task')}
              size="medium"
            >
              New Task
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
                Total Tasks
              </Typography>
              <Typography variant="h4" fontWeight="bold">
                {filteredTasks.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={3}>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                In Progress
              </Typography>
              <Typography variant="h4" fontWeight="bold" color="primary">
                {inProgressTasks.length}
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
                {completedTasks.length}
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
                {highPriorityTasks.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Task List */}
      <Typography variant="subtitle1" gutterBottom fontWeight="medium">
        Tasks ({filteredTasks.length})
      </Typography>

      {blockedTasks.length > 0 && (
        <Box sx={{ mb: 2, p: 1, bgcolor: 'error.light', borderRadius: 1 }}>
          <Typography variant="caption" color="error" fontWeight="medium">
            {blockedTasks.length} blocked task(s) need attention
          </Typography>
        </Box>
      )}

      <List sx={{ mb: 3 }}>
        {filteredTasks.map((task) => (
          <React.Fragment key={task.id}>
            <ListItem 
              alignItems="flex-start"
              secondaryAction={
                <Box>
                  <IconButton edge="end" size="small" onClick={() => sendMessage(`Update task ${task.name} status`)}> 
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton edge="end" size="small" onClick={() => sendMessage(`Delete task ${task.name}`)}> 
                    <DeleteIcon fontSize="small" color="error" />
                  </IconButton>
                </Box>
              }
              sx={{ py: 2 }}
            >
              <ListItemAvatar>
                <Avatar sx={{ bgcolor: getPriorityColor(task.priority) }}>
                  <PriorityHighIcon fontSize="small" />
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={
                  <Box display="flex" alignItems="center">
                    <Typography variant="subtitle1" fontWeight="medium" sx={{ mr: 1 }}>
                      {task.name}
                    </Typography>
                    <Chip 
                      label={task.status}
                      color={getStatusColor(task.status)}
                      size="small"
                    />
                    <Chip 
                      label={task.priority}
                      color={getPriorityColor(task.priority)}
                      size="small"
                      sx={{ ml: 1 }}
                    />
                  </Box>
                }
                secondary={
                  <Box mt={1}>
                    <LinearProgress 
                      variant="determinate"
                      value={task.progress}
                      sx={{ height: 6, borderRadius: 3, mb: 1 }}
                      color={task.progress === 100 ? 'success' : 'primary'}
                    />
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Box display="flex" alignItems="center">
                        <PersonIcon fontSize="small" color="disabled" sx={{ mr: 0.5 }} />
                        <Typography variant="caption" color="textSecondary">
                          {task.assignedTo}
                        </Typography>
                      </Box>
                      <Box display="flex" alignItems="center">
                        <CalendarTodayIcon fontSize="small" color="disabled" sx={{ mr: 0.5 }} />
                        <Typography variant="caption" color="textSecondary">
                          {task.startDate} - {task.endDate}
                        </Typography>
                      </Box>
                      <Typography variant="caption" fontWeight="medium">
                        {task.progress}% Complete
                      </Typography>
                    </Box>
                    {task.dependencies && task.dependencies.length > 0 && (
                      <Box mt={1}>
                        <Typography variant="caption" color="textSecondary">
                          Dependencies: {task.dependencies.join(', ')}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                }
              />
            </ListItem>
            <Divider component="li" />
          </React.Fragment>
        ))}
      </List>

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
              onClick={() => sendMessage('Create multiple tasks')}
            >
              Bulk Create
            </Button>
          </Grid>
          <Grid item>
            <Button 
              variant="outlined"
              color="secondary"
              size="small"
              startIcon={<CheckIcon />}
              onClick={() => sendMessage('Mark selected tasks as completed')}
            >
              Mark Complete
            </Button>
          </Grid>
          <Grid item>
            <Button 
              variant="outlined"
              color="error"
              size="small"
              onClick={() => sendMessage('Identify blocked tasks and suggest solutions')}
            >
              Resolve Blockers
            </Button>
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
};

export default TaskManagementCenter;

