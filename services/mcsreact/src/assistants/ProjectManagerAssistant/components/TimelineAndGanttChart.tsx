// services/mcsreact/src/assistants/ProjectManagerAssistant/components/TimelineAndGanttChart.tsx
import React, { useState, useRef, useEffect } from 'react';
import { LinearProgress, Box, Typography, Card, CardContent, Button, Grid, Paper, Divider, Chip, IconButton, Tooltip } from '@mui/material';
import { TimelineItem } from '../ProjectManagerAssistantPage';
import { Timeline as TimelineIcon, BarChart as BarChartIcon, CalendarToday as CalendarTodayIcon, Edit as EditIcon, Add as AddIcon } from '@mui/icons-material';

interface TimelineAndGanttChartProps {
  timelineItems: TimelineItem[];
  sendMessage: (message: string) => void;
}

const TimelineAndGanttChart: React.FC<TimelineAndGanttChartProps> = ({ timelineItems, sendMessage }) => {
  const [viewMode, setViewMode] = useState<'timeline' | 'gantt'>('timeline');
  const [selectedItem, setSelectedItem] = useState<TimelineItem | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed': return 'success';
      case 'in progress': return 'primary';
      case 'on track': return 'success';
      case 'at risk': return 'warning';
      case 'delayed': return 'error';
      default: return 'default';
    }
  };

  const getTypeColor = (type: 'milestone' | 'phase' | 'task') => {
    switch (type) {
      case 'milestone': return 'secondary';
      case 'phase': return 'info';
      case 'task': return 'primary';
      default: return 'default';
    }
  };

  const activeItems = timelineItems.filter(item => item.status.toLowerCase() !== 'completed');
  const completedItems = timelineItems.filter(item => item.status.toLowerCase() === 'completed');
  const milestones = timelineItems.filter(item => item.type === 'milestone');
  const phases = timelineItems.filter(item => item.type === 'phase');
  const tasks = timelineItems.filter(item => item.type === 'task');

  // Simple Gantt chart rendering
  useEffect(() => {
    if (!svgRef.current || viewMode !== 'gantt') return;

    const svg = svgRef.current;
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    // This is a simplified representation - in a real app you'd use a proper Gantt library
    const width = svg.clientWidth;
    const height = 200;
    const barHeight = 30;
    const padding = 20;

    timelineItems.forEach((item, index) => {
      const y = padding + index * (barHeight + 10);
      const barWidth = (width - padding * 2) * (item.progress / 100);

      // Background bar
      const bgBar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bgBar.setAttribute('x', padding.toString());
      bgBar.setAttribute('y', y.toString());
      bgBar.setAttribute('width', (width - padding * 2).toString());
      bgBar.setAttribute('height', barHeight.toString());
      bgBar.setAttribute('fill', '#f0f0f0');
      bgBar.setAttribute('stroke', '#ddd');
      bgBar.setAttribute('stroke-width', '1');
      svg.appendChild(bgBar);

      // Progress bar
      const progressBar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      progressBar.setAttribute('x', padding.toString());
      progressBar.setAttribute('y', y.toString());
      progressBar.setAttribute('width', barWidth.toString());
      progressBar.setAttribute('height', barHeight.toString());
      progressBar.setAttribute('fill', getStatusColor(item.status));
      svg.appendChild(progressBar);

      // Label
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', (padding + 5).toString());
      text.setAttribute('y', (y + barHeight / 2 + 5).toString());
      text.setAttribute('font-size', '12');
      text.setAttribute('fill', '#333');
      text.textContent = `${item.name} (${item.progress}%)`;
      svg.appendChild(text);
    });
  }, [timelineItems, viewMode]);

  return (
    <Box sx={{ p: 2, height: '100%', overflowY: 'auto' }}>
      <Typography variant="h6" gutterBottom fontWeight="bold">
        Timeline & Gantt Chart
      </Typography>

      {/* View Mode Toggle */}
      <Card elevation={3} sx={{ mb: 3, p: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item>
            <Button 
              variant={viewMode === 'timeline' ? 'contained' : 'outlined'}
              color="primary"
              startIcon={<TimelineIcon />}
              onClick={() => setViewMode('timeline')}
              size="small"
            >
              Timeline View
            </Button>
          </Grid>
          <Grid item>
            <Button 
              variant={viewMode === 'gantt' ? 'contained' : 'outlined'}
              color="primary"
              startIcon={<BarChartIcon />}
              onClick={() => setViewMode('gantt')}
              size="small"
            >
              Gantt Chart
            </Button>
          </Grid>
          <Grid item xs />
          <Grid item>
            <Button 
              variant="outlined"
              color="primary"
              startIcon={<AddIcon />}
              onClick={() => sendMessage('Add new timeline item')}
              size="small"
            >
              Add Item
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
                {timelineItems.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={3}>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                Active Items
              </Typography>
              <Typography variant="h4" fontWeight="bold" color="primary">
                {activeItems.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={3}>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                Milestones
              </Typography>
              <Typography variant="h4" fontWeight="bold" color="secondary">
                {milestones.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={6} sm={3}>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                Avg Progress
              </Typography>
              <Typography variant="h4" fontWeight="bold">
                {timelineItems.length > 0 
                  ? `${Math.round(timelineItems.reduce((sum, item) => sum + item.progress, 0) / timelineItems.length)}%`
                  : '0%'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* View Content */}
      {viewMode === 'timeline' ? (
        <Box>
          <Typography variant="subtitle1" gutterBottom fontWeight="medium">
            Project Timeline
          </Typography>

          {timelineItems.length === 0 ? (
            <Paper sx={{ p: 3, textAlign: 'center', mt: 2 }}>
              <Typography variant="body1" color="textSecondary">
                No timeline items available
              </Typography>
              <Button 
                variant="text"
                onClick={() => sendMessage('Create project timeline')}
                startIcon={<AddIcon />}
                sx={{ mt: 1 }}
              >
                Create Timeline
              </Button>
            </Paper>
          ) : (
            <Box sx={{ spaceY: 2 }}>
              {timelineItems.map((item) => (
                <Card key={item.id} elevation={2} sx={{ mb: 2 }}>
                  <CardContent>
                    <Box display="flex" justifyContent="space-between" alignItems="start">
                      <Box flexGrow={1}>
                        <Box display="flex" alignItems="center" mb={1}>
                          <Chip 
                            label={item.type}
                            color={getTypeColor(item.type)}
                            size="small"
                            sx={{ mr: 1 }}
                          />
                          <Typography variant="subtitle1" fontWeight="medium">
                            {item.name}
                          </Typography>
                          <Chip 
                            label={item.status}
                            color={getStatusColor(item.status)}
                            size="small"
                            sx={{ ml: 1 }}
                          />
                        </Box>

                        <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
                          {item.startDate} - {item.endDate}
                        </Typography>

                        <LinearProgress 
                          variant="determinate"
                          value={item.progress}
                          sx={{ height: 6, borderRadius: 3, mb: 2 }}
                          color={item.progress === 100 ? 'success' : 'primary'}
                        />

                        <Box display="flex" justifyContent="space-between" alignItems="center">
                          <Typography variant="caption" fontWeight="medium">
                            Progress: {item.progress}%
                          </Typography>
                          <Box>
                            <IconButton size="small" onClick={() => sendMessage(`Update timeline item ${item.name}`)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" onClick={() => setSelectedItem(item)}>
                              <CalendarTodayIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </Box>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}
        </Box>
      ) : (
        <Box>
          <Typography variant="subtitle1" gutterBottom fontWeight="medium">
            Gantt Chart View
          </Typography>
          <Paper elevation={3} sx={{ p: 2, height: 300, overflow: 'auto' }}>
            <svg ref={svgRef} width="100%" height="100%" style={{ display: 'block' }}>
              <rect width="100%" height="100%" fill="white" />
              <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fontSize="14" fill="#999">
                {timelineItems.length === 0 ? 'No timeline data to display' : 'Interactive Gantt Chart'}
              </text>
            </svg>
          </Paper>

          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <Typography variant="caption" color="textSecondary">
              Note: This is a simplified Gantt chart. For full functionality, consider integrating a dedicated Gantt library.
            </Typography>
          </Box>
        </Box>
      )}

      {/* Selected Item Details */}
      {selectedItem && (
        <Box sx={{ mt: 3 }}>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle1" gutterBottom fontWeight="medium">
            Timeline Item Details
          </Typography>
          <Card elevation={3}>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="start">
                <Box>
                  <Typography variant="h6" fontWeight="bold" sx={{ mb: 1 }}>
                    {selectedItem.name}
                  </Typography>
                  <Box display="flex" alignItems="center" sx={{ mb: 2 }}>
                    <Chip 
                      label={selectedItem.type}
                      color={getTypeColor(selectedItem.type)}
                      size="small"
                      sx={{ mr: 1 }}
                    />
                    <Chip 
                      label={selectedItem.status}
                      color={getStatusColor(selectedItem.status)}
                      size="small"
                      sx={{ mr: 1 }}
                    />
                    <Typography variant="body2" color="textSecondary">
                      {selectedItem.startDate} - {selectedItem.endDate}
                    </Typography>
                  </Box>

                  <Typography variant="body1" sx={{ mb: 2 }}>
                    <strong>Progress:</strong> {selectedItem.progress}%
                  </Typography>

                  <LinearProgress 
                    variant="determinate"
                    value={selectedItem.progress}
                    sx={{ height: 8, borderRadius: 4, mb: 2 }}
                    color={selectedItem.progress === 100 ? 'success' : 'primary'}
                  />

                  <Box display="flex" justifyContent="space-between" sx={{ mt: 2 }}>
                    <Button 
                      variant="outlined"
                      size="small"
                      onClick={() => sendMessage(`Update progress for ${selectedItem.name}`)}
                    >
                      Update Progress
                    </Button>
                    <Button 
                      variant="outlined"
                      size="small"
                      onClick={() => sendMessage(`Generate report for ${selectedItem.name}`)}
                    >
                      Generate Report
                    </Button>
                    <Button 
                      variant="outlined"
                      color="error"
                      size="small"
                      onClick={() => setSelectedItem(null)}
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
              onClick={() => sendMessage('Create project timeline from scratch')}
            >
              Create Timeline
            </Button>
          </Grid>
          <Grid item>
            <Button 
              variant="outlined"
              color="secondary"
              size="small"
              startIcon={<TimelineIcon />}
              onClick={() => sendMessage('Optimize project timeline')}
            >
              Optimize Timeline
            </Button>
          </Grid>
          <Grid item>
            <Button 
              variant="outlined"
              color="secondary"
              size="small"
              startIcon={<BarChartIcon />}
              onClick={() => sendMessage('Analyze timeline for bottlenecks')}
            >
              Analyze Bottlenecks
            </Button>
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
};

export default TimelineAndGanttChart;

