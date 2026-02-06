// services/mcsreact/src/assistants/ProjectManagerAssistant/components/BudgetAndFinancialTracking.tsx
import React, { useState } from 'react';
import { Box, Typography, Card, CardContent, LinearProgress, Chip, Divider, List, ListItem, ListItemText, Grid, Button, Paper, IconButton, Tooltip } from '@mui/material';
import { BudgetItem } from '../ProjectManagerAssistantPage';
import { AttachMoney as AttachMoneyIcon, Money as MoneyIcon, TrendingUp as TrendingUpIcon, TrendingDown as TrendingDownIcon, Warning as WarningIcon, CheckCircle as CheckCircleIcon, Error as ErrorIcon, Add as AddIcon, Edit as EditIcon, PieChart as PieChartIcon, BarChart as BarChartIcon, Download as DownloadIcon } from '@mui/icons-material';

interface BudgetAndFinancialTrackingProps {
  budgetItems: BudgetItem[];
  sendMessage: (message: string) => void;
}

const BudgetAndFinancialTracking: React.FC<BudgetAndFinancialTrackingProps> = ({ budgetItems, sendMessage }) => {
  const [filterCategory, setFilterCategory] = useState('all');
  const [selectedItem, setSelectedItem] = useState<BudgetItem | null>(null);

  const getVarianceColor = (variance: number) => {
    if (variance > 0) return 'error';
    if (variance < 0) return 'success';
    return 'default';
  };

  const getVarianceIcon = (variance: number) => {
    if (variance > 0) return <TrendingUpIcon color="error" fontSize="small" />;
    if (variance < 0) return <TrendingDownIcon color="success" fontSize="small" />;
    return <CheckCircleIcon color="primary" fontSize="small" />;
  };

  const filteredItems = budgetItems.filter(item => {
    const categoryMatch = filterCategory === 'all' || item.category.toLowerCase() === filterCategory.toLowerCase();
    return categoryMatch;
  });

  const totalAllocated = budgetItems.reduce((sum, item) => sum + item.allocated, 0);
  const totalSpent = budgetItems.reduce((sum, item) => sum + item.spent, 0);
  const totalRemaining = budgetItems.reduce((sum, item) => sum + item.remaining, 0);
  const totalVariance = budgetItems.reduce((sum, item) => sum + item.variance, 0);

  const overBudgetItems = budgetItems.filter(item => item.variance > 0);
  const underBudgetItems = budgetItems.filter(item => item.variance < 0);
  const onBudgetItems = budgetItems.filter(item => item.variance === 0);

  const uniqueCategories = [...new Set(budgetItems.map(item => item.category))];

  return (
    <Box sx={{ p: 2, height: '100%', overflowY: 'auto' }}>
      <Typography variant="h6" gutterBottom fontWeight="bold">
        Budget & Financial Tracking
      </Typography>

      {/* Category Filter */}
      <Card elevation={3} sx={{ mb: 3, p: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item>
            <Typography variant="subtitle2" color="textSecondary">
              Category Filter:
            </Typography>
          </Grid>
          <Grid item>
            <Button 
              variant={filterCategory === 'all' ? 'contained' : 'outlined'}
              color="primary"
              size="small"
              onClick={() => setFilterCategory('all')}
            >
              All Categories
            </Button>
          </Grid>
          {uniqueCategories.map((category) => (
            <Grid item key={category}>
              <Button 
                variant={filterCategory === category.toLowerCase() ? 'contained' : 'outlined'}
                color="primary"
                size="small"
                onClick={() => setFilterCategory(category.toLowerCase())}
              >
                {category}
              </Button>
            </Grid>
          ))}
          <Grid item xs />
          <Grid item>
            <Button 
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={() => sendMessage('Add new budget category')}
              size="small"
            >
              Add Category
            </Button>
          </Grid>
        </Grid>
      </Card>

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                Total Budget
              </Typography>
              <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography variant="h4" fontWeight="bold">
                  ${totalAllocated.toLocaleString()}
                </Typography>
                <AttachMoneyIcon color="primary" sx={{ fontSize: 32 }} />
              </Box>
              <Typography variant="caption" color="textSecondary">
                Allocated across {budgetItems.length} categories
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                Amount Spent
              </Typography>
              <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography variant="h4" fontWeight="bold" color="error.main">
                  ${totalSpent.toLocaleString()}
                </Typography>
                <MoneyIcon color="error" sx={{ fontSize: 32 }} />
              </Box>
              <LinearProgress 
                variant="determinate"
                value={(totalSpent / totalAllocated) * 100 || 0}
                sx={{ height: 6, borderRadius: 3, mt: 1 }}
                color={totalSpent > totalAllocated ? 'error' : 'primary'}
              />
              <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
                {Math.round((totalSpent / totalAllocated) * 100 || 0)}% of budget spent
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                Remaining Budget
              </Typography>
              <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography variant="h4" fontWeight="bold" color="success.main">
                  ${totalRemaining.toLocaleString()}
                </Typography>
                <CheckCircleIcon color="success" sx={{ fontSize: 32 }} />
              </Box>
              <LinearProgress 
                variant="determinate"
                value={(totalRemaining / totalAllocated) * 100 || 0}
                sx={{ height: 6, borderRadius: 3, mt: 1 }}
                color="success"
              />
              <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
                {Math.round((totalRemaining / totalAllocated) * 100 || 0)}% remaining
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                Budget Variance
              </Typography>
              <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography variant="h4" fontWeight="bold" color={getVarianceColor(totalVariance)}>
                  ${Math.abs(totalVariance).toLocaleString()}
                </Typography>
                <Box>
                  {getVarianceIcon(totalVariance)}
                  <Typography variant="caption" color="textSecondary" align="right">
                    {totalVariance >= 0 ? 'Over' : 'Under'} Budget
                  </Typography>
                </Box>
              </Box>
              <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
                {Math.round(Math.abs(totalVariance) / totalAllocated * 100 || 0)}% variance
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Budget Status Overview */}
      <Typography variant="subtitle1" gutterBottom fontWeight="medium">
        Budget Status Overview
      </Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Card elevation={3} sx={{ bgcolor: overBudgetItems.length > 0 ? 'error.light' : 'background.paper' }}>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="subtitle2" color="textSecondary">
                    Over Budget
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="error.main">
                    {overBudgetItems.length}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    categories exceeding budget
                  </Typography>
                </Box>
                <WarningIcon color="error" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={4}>
          <Card elevation={3} sx={{ bgcolor: onBudgetItems.length > 0 ? 'success.light' : 'background.paper' }}>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="subtitle2" color="textSecondary">
                    On Budget
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="success.main">
                    {onBudgetItems.length}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    categories on track
                  </Typography>
                </Box>
                <CheckCircleIcon color="success" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={4}>
          <Card elevation={3} sx={{ bgcolor: underBudgetItems.length > 0 ? 'info.light' : 'background.paper' }}>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="subtitle2" color="textSecondary">
                    Under Budget
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="info.main">
                    {underBudgetItems.length}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    categories with savings
                  </Typography>
                </Box>
                <TrendingDownIcon color="info" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Budget Items List */}
      <Typography variant="subtitle1" gutterBottom fontWeight="medium">
        Budget Breakdown ({filteredItems.length})
      </Typography>

      {overBudgetItems.length > 0 && (
        <Box sx={{ mb: 2, p: 1, bgcolor: 'error.light', borderRadius: 1 }}>
          <Typography variant="caption" color="error" fontWeight="medium">
            {overBudgetItems.length} category(ies) are over budget and need attention
          </Typography>
        </Box>
      )}

      <List sx={{ mb: 3 }}>
        {filteredItems.map((item) => (
          <React.Fragment key={item.id}>
            <ListItem 
              alignItems="flex-start"
              secondaryAction={
                <Box>
                  <IconButton edge="end" size="small" onClick={() => sendMessage(`Update budget for ${item.category}`)}> 
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton edge="end" size="small" onClick={() => setSelectedItem(item)}> 
                    <PieChartIcon fontSize="small" />
                  </IconButton>
                </Box>
              }
              sx={{ py: 2, cursor: 'pointer' }}
              onClick={() => setSelectedItem(item)}
            >
              <ListItemText
                primary={
                  <Box display="flex" alignItems="center">
                    <Typography variant="subtitle1" fontWeight="medium" sx={{ mr: 1 }}>
                      {item.category}
                    </Typography>
                    <Chip 
                      label={`$${item.allocated.toLocaleString()}`}
                      color="primary"
                      size="small"
                      sx={{ mr: 1 }}
                    />
                    <Chip 
                      label={`${Math.round((item.spent / item.allocated) * 100 || 0)}% Spent`}
                      color={item.spent > item.allocated ? 'error' : 'primary'}
                      size="small"
                    />
                  </Box>
                }
                secondary={
                  <Box mt={1}>
                    <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
                      <Typography variant="caption" color="textSecondary" sx={{ width: 80 }}>
                        Allocated:
                      </Typography>
                      <Typography variant="caption" fontWeight="medium">
                        ${item.allocated.toLocaleString()}
                      </Typography>
                    </Box>

                    <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
                      <Typography variant="caption" color="textSecondary" sx={{ width: 80 }}>
                        Spent:
                      </Typography>
                      <Typography variant="caption" fontWeight="medium" color="error.main">
                        ${item.spent.toLocaleString()}
                      </Typography>
                    </Box>

                    <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
                      <Typography variant="caption" color="textSecondary" sx={{ width: 80 }}>
                        Remaining:
                      </Typography>
                      <Typography variant="caption" fontWeight="medium" color="success.main">
                        ${item.remaining.toLocaleString()}
                      </Typography>
                    </Box>

                    <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
                      <Typography variant="caption" color="textSecondary" sx={{ width: 80 }}>
                        Variance:
                      </Typography>
                      <Box display="flex" alignItems="center">
                        {getVarianceIcon(item.variance)}
                        <Typography variant="caption" fontWeight="medium" color={getVarianceColor(item.variance)} sx={{ ml: 0.5 }}>
                          ${Math.abs(item.variance).toLocaleString()} ({item.variance >= 0 ? 'Over' : 'Under'})
                        </Typography>
                      </Box>
                    </Box>

                    {/* Progress Bar */}
                    <LinearProgress 
                      variant="determinate"
                      value={(item.spent / item.allocated) * 100 || 0}
                      sx={{ height: 6, borderRadius: 3, mt: 1 }}
                      color={item.spent > item.allocated ? 'error' : 'primary'}
                    />
                  </Box>
                }
              />
            </ListItem>
            <Divider component="li" />
          </React.Fragment>
        ))}
      </List>

      {/* Selected Item Details */}
      {selectedItem && (
        <Box sx={{ mt: 3 }}>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle1" gutterBottom fontWeight="medium">
            Budget Category Details
          </Typography>
          <Card elevation={3}>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="start">
                <Box flexGrow={1}>
                  <Typography variant="h6" fontWeight="bold" sx={{ mb: 1 }}>
                    {selectedItem.category}
                  </Typography>

                  <Box display="flex" alignItems="center" sx={{ mb: 2 }}>
                    <Chip 
                      label={`ID: ${selectedItem.id}`}
                      size="small"
                      variant="outlined"
                      sx={{ mr: 1 }}
                    />
                    <Chip 
                      label={`Variance: $${Math.abs(selectedItem.variance).toLocaleString()} ${selectedItem.variance >= 0 ? 'Over' : 'Under'}`}
                      color={getVarianceColor(selectedItem.variance)}
                      size="small"
                    />
                  </Box>

                  {/* Budget Visualization */}
                  <Typography variant="subtitle2" gutterBottom sx={{ mt: 2, mb: 1 }}>
                    Budget Allocation
                  </Typography>

                  <Box display="flex" alignItems="center" sx={{ mb: 2 }}>
                    <Typography variant="caption" color="textSecondary" sx={{ width: 120 }}>
                      Allocated Budget:
                    </Typography>
                    <Typography variant="h6" fontWeight="medium">
                      ${selectedItem.allocated.toLocaleString()}
                    </Typography>
                  </Box>

                  <Box display="flex" alignItems="center" sx={{ mb: 2 }}>
                    <Typography variant="caption" color="textSecondary" sx={{ width: 120 }}>
                      Amount Spent:
                    </Typography>
                    <Typography variant="h6" fontWeight="medium" color="error.main">
                      ${selectedItem.spent.toLocaleString()}
                    </Typography>
                  </Box>

                  <Box display="flex" alignItems="center" sx={{ mb: 2 }}>
                    <Typography variant="caption" color="textSecondary" sx={{ width: 120 }}>
                      Remaining Budget:
                    </Typography>
                    <Typography variant="h6" fontWeight="medium" color="success.main">
                      ${selectedItem.remaining.toLocaleString()}
                    </Typography>
                  </Box>

                  <Box display="flex" alignItems="center" sx={{ mb: 2 }}>
                    <Typography variant="caption" color="textSecondary" sx={{ width: 120 }}>
                      Budget Variance:
                    </Typography>
                    <Box display="flex" alignItems="center">
                      {getVarianceIcon(selectedItem.variance)}
                      <Typography variant="h6" fontWeight="medium" color={getVarianceColor(selectedItem.variance)} sx={{ ml: 1 }}>
                        ${Math.abs(selectedItem.variance).toLocaleString()}
                      </Typography>
                    </Box>
                  </Box>

                  {/* Progress Visualization */}
                  <Typography variant="subtitle2" gutterBottom sx={{ mt: 2, mb: 1 }}>
                    Budget Utilization
                  </Typography>

                  <LinearProgress 
                    variant="determinate"
                    value={(selectedItem.spent / selectedItem.allocated) * 100 || 0}
                    sx={{ height: 10, borderRadius: 5, mb: 1 }}
                    color={selectedItem.spent > selectedItem.allocated ? 'error' : 'primary'}
                  />

                  <Box display="flex" justifyContent="space-between">
                    <Typography variant="caption" color="textSecondary">
                      0%
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      {Math.round((selectedItem.spent / selectedItem.allocated) * 100 || 0)}%
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      100%
                    </Typography>
                  </Box>

                  <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
                    {selectedItem.spent > selectedItem.allocated 
                      ? 'Budget exceeded - immediate action required'
                      : selectedItem.spent > selectedItem.allocated * 0.8
                        ? 'Approaching budget limit'
                        : 'Budget utilization within safe limits'}
                  </Typography>

                  {/* Actions */}
                  <Box display="flex" justifyContent="space-between" sx={{ mt: 3 }}>
                    <Button 
                      variant="contained"
                      color="primary"
                      size="small"
                      startIcon={<EditIcon />}
                      onClick={() => sendMessage(`Adjust budget for ${selectedItem.category} category`)}
                    >
                      Adjust Budget
                    </Button>
                    <Button 
                      variant="outlined"
                      color="secondary"
                      size="small"
                      startIcon={<BarChartIcon />}
                      onClick={() => sendMessage(`Analyze spending trends for ${selectedItem.category}`)}
                    >
                      Analyze Trends
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
              startIcon={<PieChartIcon />}
              onClick={() => sendMessage('Generate comprehensive budget report')}
            >
              Budget Report
            </Button>
          </Grid>
          <Grid item>
            <Button 
              variant="outlined"
              color="secondary"
              size="small"
              startIcon={<BarChartIcon />}
              onClick={() => sendMessage('Analyze budget variance and trends')}
            >
              Variance Analysis
            </Button>
          </Grid>
          <Grid item>
            <Button 
              variant="outlined"
              color="success"
              size="small"
              startIcon={<DownloadIcon />}
              onClick={() => sendMessage('Export budget data to CSV')}
            >
              Export Data
            </Button>
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
};

export default BudgetAndFinancialTracking;

