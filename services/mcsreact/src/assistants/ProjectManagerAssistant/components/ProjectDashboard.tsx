// services/mcsreact/src/assistants/ProjectManagerAssistant/components/ProjectDashboard.tsx
import React from 'react';
import { Box, Typography, Card, CardContent, LinearProgress, Chip, Divider, List, ListItem, ListItemText, Avatar, Grid, Button } from '@mui/material';
import { Project } from '../ProjectManagerAssistantPage';

interface ProjectDashboardProps {
  projects: Project[];
  sendMessage: (message: string) => void;
}

const ProjectDashboard: React.FC<ProjectDashboardProps> = ({ projects, sendMessage }) => {
  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed': return 'success';
      case 'in progress': return 'primary';
      case 'on hold': return 'warning';
      case 'at risk': return 'error';
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

  const activeProjects = projects.filter(p => p.status.toLowerCase() !== 'completed');
  const completedProjects = projects.filter(p => p.status.toLowerCase() === 'completed');
  const highPriorityProjects = projects.filter(p => p.priority === 'high');

  return (
    <Box sx={{ p: 2, height: '100%', overflowY: 'auto' }}>
      <Typography variant="h6" gutterBottom fontWeight="bold">
        Project Dashboard
      </Typography>

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6}>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                Total Projects
              </Typography>
              <Typography variant="h4" fontWeight="bold">
                {projects.length}
              </Typography>
              <LinearProgress 
                variant="determinate"
                value={(completedProjects.length / projects.length) * 100 || 0}
                sx={{ mt: 2, height: 6, borderRadius: 3 }}
              />
              <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
                {completedProjects.length} completed
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6}>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                Active Projects
              </Typography>
              <Typography variant="h4" fontWeight="bold">
                {activeProjects.length}
              </Typography>
              <Box sx={{ mt: 2 }}>
                {highPriorityProjects.length > 0 && (
                  <Chip 
                    label={`${highPriorityProjects.length} High Priority`}
                    color="error"
                    size="small"
                    sx={{ mr: 1 }}
                  />
                )}
                <Chip 
                  label={`${projects.reduce((sum, p) => sum + p.teamSize, 0)} Team Members`}
                  color="info"
                  size="small"
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Project List */}
      <Typography variant="subtitle1" gutterBottom fontWeight="medium">
        Active Projects ({activeProjects.length})
      </Typography>

      <List sx={{ mb: 3 }}>
        {activeProjects.map((project) => (
          <React.Fragment key={project.id}>
            <ListItem 
              alignItems="flex-start"
              secondaryAction={
                <Button 
                  size="small"
                  variant="outlined"
                  onClick={() => sendMessage(`Show details for project ${project.name}`)}
                >
                  View Details
                </Button>
              }
              sx={{ py: 2 }}
            >
              <ListItemText
                primary={
                  <Box display="flex" alignItems="center">
                    <Typography variant="subtitle1" fontWeight="medium" sx={{ mr: 1 }}>
                      {project.name}
                    </Typography>
                    <Chip 
                      label={project.status}
                      color={getStatusColor(project.status)}
                      size="small"
                    />
                    <Chip 
                      label={project.priority}
                      color={getPriorityColor(project.priority)}
                      size="small"
                      sx={{ ml: 1 }}
                    />
                  </Box>
                }
                secondary={
                  <Box mt={1}>
                    <LinearProgress 
                      variant="determinate"
                      value={project.progress}
                      sx={{ height: 6, borderRadius: 3, mb: 1 }}
                    />
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="caption" color="textSecondary">
                        {project.startDate} - {project.endDate}
                      </Typography>
                      <Typography variant="caption" fontWeight="medium">
                        {project.progress}% Complete
                      </Typography>
                    </Box>
                    <Box mt={1}>
                      <Typography variant="caption" color="textSecondary">
                        Budget: ${project.budget.toLocaleString()}
                      </Typography>
                      <Typography variant="caption" color="textSecondary" sx={{ ml: 2 }}>
                        Team: {project.teamSize} members
                      </Typography>
                    </Box>
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
              onClick={() => sendMessage('Create a new project')}
            >
              Create Project
            </Button>
          </Grid>
          <Grid item>
            <Button 
              variant="outlined"
              color="primary"
              size="small"
              onClick={() => sendMessage('Generate project status report')}
            >
              Generate Report
            </Button>
          </Grid>
          <Grid item>
            <Button 
              variant="outlined"
              color="secondary"
              size="small"
              onClick={() => sendMessage('Analyze project risks')}
            >
              Risk Analysis
            </Button>
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
};

export default ProjectDashboard;

