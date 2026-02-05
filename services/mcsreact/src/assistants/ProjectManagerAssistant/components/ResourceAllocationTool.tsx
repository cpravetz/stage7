// services/mcsreact/src/assistants/ProjectManagerAssistant/components/ResourceAllocationTool.tsx
import React, { useState } from 'react';
import { Box, Typography, Card, CardContent, LinearProgress, Chip, Divider, List, ListItem, ListItemText, ListItemAvatar, Avatar, Grid, Button, TextField, MenuItem, Select, FormControl, InputLabel, Slider, Paper, IconButton, Tooltip } from '@mui/material';
import { Resource } from '../ProjectManagerAssistantPage';
import { Person as PersonIcon, Work as WorkIcon, Group as GroupIcon, Add as AddIcon, Edit as EditIcon, Search as SearchIcon, Balance as BalanceIcon } from '@mui/icons-material';

interface ResourceAllocationToolProps {
  resources: Resource[];
  sendMessage: (message: string) => void;
}

const ResourceAllocationTool: React.FC<ResourceAllocationToolProps> = ({ resources, sendMessage }) => {
  const [filterRole, setFilterRole] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);

  const getAllocationColor = (allocation: number) => {
    if (allocation >= 90) return 'error';
    if (allocation >= 70) return 'warning';
    return 'success';
  };

  const getAvailabilityColor = (availability: number) => {
    if (availability <= 10) return 'error';
    if (availability <= 30) return 'warning';
    return 'success';
  };

  const filteredResources = resources.filter(resource => {
    const roleMatch = filterRole === 'all' || resource.role.toLowerCase() === filterRole.toLowerCase();
    const searchMatch = resource.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                       resource.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
                       resource.skills.some(skill => skill.toLowerCase().includes(searchTerm.toLowerCase()));
    return roleMatch && searchMatch;
  });

  const overAllocatedResources = resources.filter(r => r.allocation > r.availability);
  const underUtilizedResources = resources.filter(r => r.allocation < 30);
  const averageAllocation = resources.length > 0 
    ? resources.reduce((sum, r) => sum + r.allocation, 0) / resources.length
    : 0;

  const uniqueRoles = [...new Set(resources.map(r => r.role))];

  return (
    <Box sx={{ p: 2, height: '100%', overflowY: 'auto' }}>
      <Typography variant="h6" gutterBottom fontWeight="bold">
        Resource Allocation Tool
      </Typography>

      {/* Filters and Search */}
      <Card elevation={3} sx={{ mb: 3, p: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={5}>
            <TextField
              fullWidth
              label="Search Resources"
              variant="outlined"
              size="small"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, role, or skill..."
              InputProps={{
                startAdornment: <SearchIcon color="disabled" sx={{ mr: 1 }} />
              }}
            />
          </Grid>

          <Grid item xs={12} sm={4}>
            <FormControl fullWidth size="small">
              <InputLabel>Role</InputLabel>
              <Select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value as string)}
                label="Role"
              >
                <MenuItem value="all">All Roles</MenuItem>
                {uniqueRoles.map((role) => (
                  <MenuItem key={role} value={role}>{role}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={3}>
            <Button 
              fullWidth
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={() => sendMessage('Add new resource to team')}
              size="medium"
            >
              Add Resource
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
                Total Resources
              </Typography>
              <Typography variant="h4" fontWeight="bold">
                {resources.length}
              </Typography>
              <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
                {uniqueRoles.length} roles
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={3}>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                Avg Allocation
              </Typography>
              <Typography variant="h4" fontWeight="bold">
                {Math.round(averageAllocation)}%
              </Typography>
              <LinearProgress 
                variant="determinate"
                value={averageAllocation}
                sx={{ mt: 1, height: 6, borderRadius: 3 }}
                color={getAllocationColor(averageAllocation)}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={3}>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                Over-Allocated
              </Typography>
              <Typography variant="h4" fontWeight="bold" color="error.main">
                {overAllocatedResources.length}
              </Typography>
              <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
                Need attention
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={3}>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                Under-Utilized
              </Typography>
              <Typography variant="h4" fontWeight="bold" color="warning.main">
                {underUtilizedResources.length}
              </Typography>
              <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
                Available capacity
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Resource List */}
      <Typography variant="subtitle1" gutterBottom fontWeight="medium">
        Team Resources ({filteredResources.length})
      </Typography>

      {overAllocatedResources.length > 0 && (
        <Box sx={{ mb: 2, p: 1, bgcolor: 'error.light', borderRadius: 1 }}>
          <Typography variant="caption" color="error" fontWeight="medium">
            {overAllocatedResources.length} resource(s) are over-allocated and need attention
          </Typography>
        </Box>
      )}

      <List sx={{ mb: 3 }}>
        {filteredResources.map((resource) => (
          <React.Fragment key={resource.id}>
            <ListItem 
              alignItems="flex-start"
              secondaryAction={
                <Box>
                  <IconButton edge="end" size="small" onClick={() => sendMessage(`Update resource allocation for ${resource.name}`)}> 
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton edge="end" size="small" onClick={() => setSelectedResource(resource)}> 
                    <BalanceIcon fontSize="small" />
                  </IconButton>
                </Box>
              }
              sx={{ py: 2, cursor: 'pointer' }}
              onClick={() => setSelectedResource(resource)}
            >
              <ListItemAvatar>
                <Avatar sx={{ bgcolor: getAllocationColor(resource.allocation) }}>
                  <PersonIcon fontSize="small" />
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={
                  <Box display="flex" alignItems="center">
                    <Typography variant="subtitle1" fontWeight="medium" sx={{ mr: 1 }}>
                      {resource.name}
                    </Typography>
                    <Chip 
                      label={resource.role}
                      color="info"
                      size="small"
                    />
                  </Box>
                }
                secondary={
                  <Box mt={1}>
                    {/* Allocation Progress */}
                    <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
                      <Typography variant="caption" color="textSecondary" sx={{ mr: 1 }}>
                        Allocation:
                      </Typography>
                      <LinearProgress 
                        variant="determinate"
                        value={resource.allocation}
                        sx={{ flexGrow: 1, height: 6, borderRadius: 3, mr: 1 }}
                        color={getAllocationColor(resource.allocation)}
                      />
                      <Typography variant="caption" fontWeight="medium">
                        {resource.allocation}%
                      </Typography>
                    </Box>

                    {/* Availability Progress */}
                    <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
                      <Typography variant="caption" color="textSecondary" sx={{ mr: 1 }}>
                        Availability:
                      </Typography>
                      <LinearProgress 
                        variant="determinate"
                        value={resource.availability}
                        sx={{ flexGrow: 1, height: 6, borderRadius: 3, mr: 1 }}
                        color={getAvailabilityColor(resource.availability)}
                      />
                      <Typography variant="caption" fontWeight="medium">
                        {resource.availability}%
                      </Typography>
                    </Box>

                    {/* Projects and Skills */}
                    <Box display="flex" justifyContent="space-between" sx={{ mt: 1 }}>
                      <Box>
                        <Typography variant="caption" color="textSecondary">
                          <WorkIcon fontSize="inherit" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                          {resource.projects.length} project(s)
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="textSecondary">
                          <GroupIcon fontSize="inherit" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                          {resource.skills.length} skill(s)
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                }
              />
            </ListItem>
            <Divider component="li" />
          </React.Fragment>
        ))}
      </List>

      {/* Selected Resource Details */}
      {selectedResource && (
        <Box sx={{ mt: 3 }}>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle1" gutterBottom fontWeight="medium">
            Resource Details
          </Typography>
          <Card elevation={3}>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="start">
                <Box flexGrow={1}>
                  <Typography variant="h6" fontWeight="bold" sx={{ mb: 1 }}>
                    {selectedResource.name}
                  </Typography>

                  <Box display="flex" alignItems="center" sx={{ mb: 2 }}>
                    <Chip 
                      label={selectedResource.role}
                      color="info"
                      size="small"
                      sx={{ mr: 1 }}
                    />
                    <Chip 
                      label={`${selectedResource.allocation}% Allocated`}
                      color={getAllocationColor(selectedResource.allocation)}
                      size="small"
                      sx={{ mr: 1 }}
                    />
                    <Chip 
                      label={`${selectedResource.availability}% Available`}
                      color={getAvailabilityColor(selectedResource.availability)}
                      size="small"
                    />
                  </Box>

                  {/* Allocation Visualization */}
                  <Typography variant="subtitle2" gutterBottom sx={{ mt: 2, mb: 1 }}>
                    Allocation Details
                  </Typography>
                  <Box display="flex" alignItems="center" sx={{ mb: 2 }}>
                    <Typography variant="caption" color="textSecondary" sx={{ width: 100 }}>
                      Current Allocation:
                    </Typography>
                    <LinearProgress 
                      variant="determinate"
                      value={selectedResource.allocation}
                      sx={{ flexGrow: 1, height: 8, borderRadius: 4, mr: 2 }}
                      color={getAllocationColor(selectedResource.allocation)}
                    />
                    <Typography variant="body2" fontWeight="medium">
                      {selectedResource.allocation}%
                    </Typography>
                  </Box>

                  <Box display="flex" alignItems="center" sx={{ mb: 2 }}>
                    <Typography variant="caption" color="textSecondary" sx={{ width: 100 }}>
                      Available Capacity:
                    </Typography>
                    <LinearProgress 
                      variant="determinate"
                      value={selectedResource.availability}
                      sx={{ flexGrow: 1, height: 8, borderRadius: 4, mr: 2 }}
                      color={getAvailabilityColor(selectedResource.availability)}
                    />
                    <Typography variant="body2" fontWeight="medium">
                      {selectedResource.availability}%
                    </Typography>
                  </Box>

                  {/* Projects */}
                  {selectedResource.projects.length > 0 && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        Assigned Projects ({selectedResource.projects.length})
                      </Typography>
                      <Box display="flex" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
                        {selectedResource.projects.map((projectId) => (
                          <Chip 
                            key={projectId}
                            label={`Project ${projectId}`}
                            size="small"
                            variant="outlined"
                          />
                        ))}
                      </Box>
                    </Box>
                  )}

                  {/* Skills */}
                  {selectedResource.skills.length > 0 && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        Skills ({selectedResource.skills.length})
                      </Typography>
                      <Box display="flex" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
                        {selectedResource.skills.map((skill) => (
                          <Chip 
                            key={skill}
                            label={skill}
                            size="small"
                            color="primary"
                            variant="outlined"
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
                      onClick={() => sendMessage(`Adjust allocation for ${selectedResource.name}`)}
                    >
                      Adjust Allocation
                    </Button>
                    <Button 
                      variant="outlined"
                      color="secondary"
                      size="small"
                      onClick={() => sendMessage(`Optimize resource allocation for ${selectedResource.name}`)}
                    >
                      Optimize
                    </Button>
                    <Button 
                      variant="outlined"
                      color="error"
                      size="small"
                      onClick={() => setSelectedResource(null)}
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
              startIcon={<BalanceIcon />}
              onClick={() => sendMessage('Balance resource allocation across all team members')}
            >
              Balance Allocation
            </Button>
          </Grid>
          <Grid item>
            <Button 
              variant="outlined"
              color="secondary"
              size="small"
              startIcon={<GroupIcon />}
              onClick={() => sendMessage('Identify resource bottlenecks and suggest solutions')}
            >
              Identify Bottlenecks
            </Button>
          </Grid>
          <Grid item>
            <Button 
              variant="outlined"
              color="secondary"
              size="small"
              startIcon={<WorkIcon />}
              onClick={() => sendMessage('Generate resource utilization report')}
            >
              Generate Report
            </Button>
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
};

export default ResourceAllocationTool;

