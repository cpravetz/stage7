// services/mcsreact/src/assistants/ProjectManagerAssistant/components/ProjectAnalyticsDashboard.tsx
import React, { useState } from 'react';
import { Box, Typography, Card, CardContent, LinearProgress, Chip, Divider, List, ListItem, ListItemText, Grid, Button, Paper, IconButton, Tooltip } from '@mui/material';
import { ProjectAnalytics } from '../ProjectManagerAssistantPage';
import { Analytics as AnalyticsIcon, TrendingUp as TrendingUpIcon, TrendingDown as TrendingDownIcon, CheckCircle as CheckCircleIcon, Warning as WarningIcon, Error as ErrorIcon, BarChart as BarChartIcon, Timeline as TimelineIcon, Assessment as AssessmentIcon, Download as DownloadIcon } from '@mui/icons-material';

interface ProjectAnalyticsDashboardProps {
  projectAnalytics: ProjectAnalytics;
  sendMessage: (message: string) => void;
}

const ProjectAnalyticsDashboard: React.FC<ProjectAnalyticsDashboardProps> = ({ projectAnalytics, sendMessage }) => {
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'quarter' | 'year'>('month');

  const getTrendIcon = (current: number, previous: number) => {
    if (current > previous) return <TrendingUpIcon color="error" fontSize="small" />;
    if (current < previous) return <TrendingDownIcon color="success" fontSize="small" />;
    return <CheckCircleIcon color="primary" fontSize="small" />;
  };

  const getPerformanceColor = (value: number, threshold: number = 70) => {
    if (value >= threshold) return 'success';
    if (value >= 50) return 'warning';
    return 'error';
  };

  // Mock data for comparison (in a real app, this would come from historical data)
  const previousAnalytics = {
    onTimeDeliveryRate: projectAnalytics.onTimeDeliveryRate > 10 ? projectAnalytics.onTimeDeliveryRate - 5 : projectAnalytics.onTimeDeliveryRate,
    budgetComplianceRate: projectAnalytics.budgetComplianceRate > 10 ? projectAnalytics.budgetComplianceRate - 3 : projectAnalytics.budgetComplianceRate,
    resourceUtilization: projectAnalytics.resourceUtilization > 10 ? projectAnalytics.resourceUtilization - 8 : projectAnalytics.resourceUtilization,
  };

  return (
    <Box sx={{ p: 2, height: '100%', overflowY: 'auto' }}>
      <Typography variant="h6" gutterBottom fontWeight="bold">
        Project Analytics Dashboard
      </Typography>

      {/* Time Range Selector */}
      <Card elevation={3} sx={{ mb: 3, p: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item>
            <Typography variant="subtitle2" color="textSecondary">
              Time Range:
            </Typography>
          </Grid>
          <Grid item>
            <Button 
              variant={timeRange === 'week' ? 'contained' : 'outlined'}
              color="primary"
              size="small"
              onClick={() => setTimeRange('week')}
            >
              Week
            </Button>
          </Grid>
          <Grid item>
            <Button 
              variant={timeRange === 'month' ? 'contained' : 'outlined'}
              color="primary"
              size="small"
              onClick={() => setTimeRange('month')}
            >
              Month
            </Button>
          </Grid>
          <Grid item>
            <Button 
              variant={timeRange === 'quarter' ? 'contained' : 'outlined'}
              color="primary"
              size="small"
              onClick={() => setTimeRange('quarter')}
            >
              Quarter
            </Button>
          </Grid>
          <Grid item>
            <Button 
              variant={timeRange === 'year' ? 'contained' : 'outlined'}
              color="primary"
              size="small"
              onClick={() => setTimeRange('year')}
            >
              Year
            </Button>
          </Grid>
          <Grid item xs />
          <Grid item>
            <Button 
              variant="outlined"
              color="primary"
              startIcon={<DownloadIcon />}
              onClick={() => sendMessage('Export project analytics report')}
              size="small"
            >
              Export Report
            </Button>
          </Grid>
        </Grid>
      </Card>

      {/* Key Metrics Cards */}
      <Typography variant="subtitle1" gutterBottom fontWeight="medium">
        Key Performance Indicators
      </Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {/* Project Status */}
        <Grid item xs={12} sm={4}>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                Project Status
              </Typography>
              <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                <Typography variant="h3" fontWeight="bold">
                  {projectAnalytics.totalProjects}
                </Typography>
                <AnalyticsIcon color="primary" sx={{ fontSize: 40 }} />
              </Box>
              <Divider sx={{ my: 1 }} />
              <Box display="flex" justifyContent="space-between" sx={{ mt: 1 }}>
                <Box textAlign="center">
                  <Typography variant="h6" fontWeight="bold" color="primary">
                    {projectAnalytics.activeProjects}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    Active
                  </Typography>
                </Box>
                <Box textAlign="center">
                  <Typography variant="h6" fontWeight="bold" color="success.main">
                    {projectAnalytics.completedProjects}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    Completed
                  </Typography>
                </Box>
                <Box textAlign="center">
                  <Typography variant="h6" fontWeight="bold" color="warning.main">
                    {projectAnalytics.totalProjects - projectAnalytics.activeProjects - projectAnalytics.completedProjects}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    On Hold
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Delivery Performance */}
        <Grid item xs={12} sm={4}>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                On-Time Delivery
              </Typography>
              <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                <Typography variant="h3" fontWeight="bold">
                  {projectAnalytics.onTimeDeliveryRate}%
                </Typography>
                <Box>
                  {getTrendIcon(projectAnalytics.onTimeDeliveryRate, previousAnalytics.onTimeDeliveryRate)}
                  <Typography variant="caption" color="textSecondary" align="right">
                    vs {previousAnalytics.onTimeDeliveryRate}%
                  </Typography>
                </Box>
              </Box>
              <LinearProgress 
                variant="determinate"
                value={projectAnalytics.onTimeDeliveryRate}
                sx={{ height: 8, borderRadius: 4 }}
                color={getPerformanceColor(projectAnalytics.onTimeDeliveryRate)}
              />
              <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
                {projectAnalytics.onTimeDeliveryRate >= 90 ? 'Excellent' : projectAnalytics.onTimeDeliveryRate >= 70 ? 'Good' : 'Needs Improvement'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Budget Performance */}
        <Grid item xs={12} sm={4}>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                Budget Compliance
              </Typography>
              <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                <Typography variant="h3" fontWeight="bold">
                  {projectAnalytics.budgetComplianceRate}%
                </Typography>
                <Box>
                  {getTrendIcon(projectAnalytics.budgetComplianceRate, previousAnalytics.budgetComplianceRate)}
                  <Typography variant="caption" color="textSecondary" align="right">
                    vs {previousAnalytics.budgetComplianceRate}%
                  </Typography>
                </Box>
              </Box>
              <LinearProgress 
                variant="determinate"
                value={projectAnalytics.budgetComplianceRate}
                sx={{ height: 8, borderRadius: 4 }}
                color={getPerformanceColor(projectAnalytics.budgetComplianceRate)}
              />
              <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
                {projectAnalytics.budgetComplianceRate >= 90 ? 'Excellent' : projectAnalytics.budgetComplianceRate >= 70 ? 'Good' : 'Needs Attention'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Resource and Productivity Metrics */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {/* Resource Utilization */}
        <Grid item xs={12} sm={6}>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                Resource Utilization
              </Typography>
              <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                <Typography variant="h3" fontWeight="bold">
                  {projectAnalytics.resourceUtilization}%
                </Typography>
                <Box>
                  {getTrendIcon(projectAnalytics.resourceUtilization, previousAnalytics.resourceUtilization)}
                  <Typography variant="caption" color="textSecondary" align="right">
                    vs {previousAnalytics.resourceUtilization}%
                  </Typography>
                </Box>
              </Box>
              <LinearProgress 
                variant="determinate"
                value={projectAnalytics.resourceUtilization}
                sx={{ height: 8, borderRadius: 4 }}
                color={getPerformanceColor(projectAnalytics.resourceUtilization, 80)}
              />
              <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
                {projectAnalytics.resourceUtilization >= 85 ? 'High Utilization' : projectAnalytics.resourceUtilization >= 60 ? 'Optimal' : 'Underutilized'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Productivity Metrics */}
        <Grid item xs={12} sm={6}>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                Productivity Metrics
              </Typography>
              <Grid container spacing={2} sx={{ mt: 1 }}>
                <Grid item xs={6}>
                  <Typography variant="caption" color="textSecondary">
                    Tasks Completed
                  </Typography>
                  <Typography variant="h5" fontWeight="bold" color="success.main">
                    {projectAnalytics.productivityMetrics.tasksCompleted}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="textSecondary">
                    Tasks Overdue
                  </Typography>
                  <Typography variant="h5" fontWeight="bold" color="error.main">
                    {projectAnalytics.productivityMetrics.tasksOverdue}
                  </Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="caption" color="textSecondary">
                    Avg Completion Time (days)
                  </Typography>
                  <Typography variant="h5" fontWeight="bold">
                    {projectAnalytics.productivityMetrics.averageCompletionTime}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Risk Distribution */}
      <Typography variant="subtitle1" gutterBottom fontWeight="medium">
        Risk Distribution
      </Typography>
      <Card elevation={3} sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="subtitle2" color="textSecondary">
              Risk Categories
            </Typography>
            <Chip 
              label={`Total: ${Object.values(projectAnalytics.riskDistribution).reduce((sum, val) => sum + val, 0)} risks`}
              size="small"
              variant="outlined"
            />
          </Box>

          {Object.entries(projectAnalytics.riskDistribution).length > 0 ? (
            <List>
              {Object.entries(projectAnalytics.riskDistribution).map(([category, count]) => (
                <React.Fragment key={category}>
                  <ListItem>
                    <ListItemText
                      primary={category}
                      secondary={
                        <LinearProgress 
                          variant="determinate"
                          value={(count / Object.values(projectAnalytics.riskDistribution).reduce((sum, val) => sum + val, 1)) * 100}
                          sx={{ height: 6, borderRadius: 3, mt: 1 }}
                          color={count > 5 ? 'error' : count > 2 ? 'warning' : 'success'}
                        />
                      }
                    />
                    <Typography variant="body2" fontWeight="medium">
                      {count}
                    </Typography>
                  </ListItem>
                  <Divider component="li" />
                </React.Fragment>
              ))}
            </List>
          ) : (
            <Typography variant="body2" color="textSecondary" textAlign="center" sx={{ py: 2 }}>
              No risk distribution data available
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Performance Trends */}
      <Typography variant="subtitle1" gutterBottom fontWeight="medium">
        Performance Trends
      </Typography>
      <Card elevation={3} sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle2" color="textSecondary" gutterBottom>
            Project Health Overview
          </Typography>

          <Grid container spacing={2} sx={{ mt: 2 }}>
            <Grid item xs={6}>
              <Box display="flex" alignItems="center">
                <CheckCircleIcon color="success" sx={{ mr: 1 }} />
                <Typography variant="body2">
                  On-Time Delivery: {projectAnalytics.onTimeDeliveryRate}%
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={6}>
              <Box display="flex" alignItems="center">
                <CheckCircleIcon color="success" sx={{ mr: 1 }} />
                <Typography variant="body2">
                  Budget Compliance: {projectAnalytics.budgetComplianceRate}%
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={6}>
              <Box display="flex" alignItems="center">
                <WarningIcon color="warning" sx={{ mr: 1 }} />
                <Typography variant="body2">
                  Resource Utilization: {projectAnalytics.resourceUtilization}%
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={6}>
              <Box display="flex" alignItems="center">
                <ErrorIcon color="error" sx={{ mr: 1 }} />
                <Typography variant="body2">
                  Tasks Overdue: {projectAnalytics.productivityMetrics.tasksOverdue}
                </Typography>
              </Box>
            </Grid>
          </Grid>

          {/* Simple Performance Chart */}
          <Box sx={{ mt: 3, height: 150, display: 'flex', alignItems: 'flex-end', gap: 1 }}>
            <Box sx={{ height: `${projectAnalytics.onTimeDeliveryRate}%`, width: '20%', bgcolor: 'success.main', borderRadius: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', p: 0.5 }}>
              <Typography variant="caption" color="white">
                {projectAnalytics.onTimeDeliveryRate}%
              </Typography>
            </Box>
            <Box sx={{ height: `${projectAnalytics.budgetComplianceRate}%`, width: '20%', bgcolor: 'primary.main', borderRadius: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', p: 0.5 }}>
              <Typography variant="caption" color="white">
                {projectAnalytics.budgetComplianceRate}%
              </Typography>
            </Box>
            <Box sx={{ height: `${projectAnalytics.resourceUtilization}%`, width: '20%', bgcolor: 'warning.main', borderRadius: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', p: 0.5 }}>
              <Typography variant="caption" color="white">
                {projectAnalytics.resourceUtilization}%
              </Typography>
            </Box>
            <Box sx={{ height: `${Math.min(projectAnalytics.productivityMetrics.tasksCompleted * 2, 100)}%`, width: '20%', bgcolor: 'info.main', borderRadius: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', p: 0.5 }}>
              <Typography variant="caption" color="white">
                {projectAnalytics.productivityMetrics.tasksCompleted}
              </Typography>
            </Box>
            <Box sx={{ height: `${Math.min(projectAnalytics.productivityMetrics.tasksOverdue * 5, 100)}%`, width: '20%', bgcolor: 'error.main', borderRadius: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', p: 0.5 }}>
              <Typography variant="caption" color="white">
                {projectAnalytics.productivityMetrics.tasksOverdue}
              </Typography>
            </Box>
          </Box>

          <Box display="flex" justifyContent="space-between" sx={{ mt: 1 }}>
            <Typography variant="caption" color="textSecondary">Delivery</Typography>
            <Typography variant="caption" color="textSecondary">Budget</Typography>
            <Typography variant="caption" color="textSecondary">Resources</Typography>
            <Typography variant="caption" color="textSecondary">Completed</Typography>
            <Typography variant="caption" color="textSecondary">Overdue</Typography>
          </Box>
        </CardContent>
      </Card>

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
              startIcon={<AnalyticsIcon />}
              onClick={() => sendMessage('Generate comprehensive project analytics report')}
            >
              Full Analysis
            </Button>
          </Grid>
          <Grid item>
            <Button 
              variant="outlined"
              color="secondary"
              size="small"
              startIcon={<BarChartIcon />}
              onClick={() => sendMessage('Analyze project performance trends')}
            >
              Trend Analysis
            </Button>
          </Grid>
          <Grid item>
            <Button 
              variant="outlined"
              color="secondary"
              size="small"
              startIcon={<AssessmentIcon />}
              onClick={() => sendMessage('Identify areas for improvement')}
            >
              Improvement Areas
            </Button>
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
};

export default ProjectAnalyticsDashboard;

