import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Card,
  CardContent,
  LinearProgress
} from '@mui/material/index.js';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';

interface BudgetItem {
  category: string;
  budgeted: number;
  actual: number;
  variance: number;
  variancePercent: number;
}

interface Department {
  name: string;
  budgeted: number;
  actual: number;
  ytd: number;
}

const mockBudgetData: BudgetItem[] = [
  { category: 'Personnel', budgeted: 5000000, actual: 4850000, variance: 150000, variancePercent: 3.0 },
  { category: 'Marketing', budgeted: 1200000, actual: 1350000, variance: -150000, variancePercent: -12.5 },
  { category: 'Operations', budgeted: 3000000, actual: 2900000, variance: 100000, variancePercent: 3.3 },
  { category: 'Technology', budgeted: 2500000, actual: 2600000, variance: -100000, variancePercent: -4.0 },
  { category: 'Facilities', budgeted: 800000, actual: 775000, variance: 25000, variancePercent: 3.1 },
];

const mockDepartmentData: Department[] = [
  { name: 'Engineering', budgeted: 3500000, actual: 3400000, ytd: 2550000 },
  { name: 'Sales', budgeted: 2000000, actual: 2100000, ytd: 1575000 },
  { name: 'Marketing', budgeted: 1200000, actual: 1350000, ytd: 1012500 },
  { name: 'Operations', budgeted: 1500000, actual: 1450000, ytd: 1087500 },
  { name: 'Support', budgeted: 900000, actual: 875000, ytd: 656250 },
];

const BudgetingCenter: React.FC = () => {
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const handleOpenDialog = (category: string) => {
    setSelectedCategory(category);
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedCategory(null);
  };

  const totalBudgeted = mockBudgetData.reduce((sum, item) => sum + item.budgeted, 0);
  const totalActual = mockBudgetData.reduce((sum, item) => sum + item.actual, 0);
  const totalVariance = totalBudgeted - totalActual;
  const totalVariancePercent = ((totalVariance / totalBudgeted) * 100).toFixed(1);

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Budget Management Center
      </Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Total Budgeted
              </Typography>
              <Typography variant="h4">
                ${(totalBudgeted / 1000000).toFixed(2)}M
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Total Actual
              </Typography>
              <Typography variant="h4">
                ${(totalActual / 1000000).toFixed(2)}M
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: totalVariance > 0 ? '#e8f5e9' : '#ffebee' }}>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Variance
              </Typography>
              <Typography variant="h4" sx={{ display: 'flex', alignItems: 'center' }}>
                {totalVariance > 0 ? (
                  <TrendingUpIcon color="success" sx={{ mr: 1 }} />
                ) : (
                  <TrendingDownIcon color="error" sx={{ mr: 1 }} />
                )}
                {totalVariancePercent}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Budget vs Actual by Category
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Category</TableCell>
                <TableCell align="right">Budgeted</TableCell>
                <TableCell align="right">Actual</TableCell>
                <TableCell align="right">Variance</TableCell>
                <TableCell align="right">Variance %</TableCell>
                <TableCell align="center">Status</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {mockBudgetData.map((item) => (
                <TableRow key={item.category} hover>
                  <TableCell>{item.category}</TableCell>
                  <TableCell align="right">${item.budgeted.toLocaleString()}</TableCell>
                  <TableCell align="right">${item.actual.toLocaleString()}</TableCell>
                  <TableCell
                    align="right"
                    sx={{ color: item.variance > 0 ? 'success.main' : 'error.main' }}
                  >
                    ${Math.abs(item.variance).toLocaleString()}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ color: item.variancePercent > 0 ? 'success.main' : 'error.main' }}
                  >
                    {item.variancePercent > 0 ? '+' : ''}{item.variancePercent.toFixed(1)}%
                  </TableCell>
                  <TableCell align="center">
                    <LinearProgress
                      variant="determinate"
                      value={Math.min((item.actual / item.budgeted) * 100, 100)}
                      sx={{ width: 80 }}
                      color={item.actual > item.budgeted ? 'error' : 'success'}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => handleOpenDialog(item.category)}
                    >
                      Details
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Paper elevation={2} sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Department Budget Summary
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Department</TableCell>
                <TableCell align="right">Annual Budget</TableCell>
                <TableCell align="right">YTD Actual</TableCell>
                <TableCell align="right">YTD Budget</TableCell>
                <TableCell align="center">Progress</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {mockDepartmentData.map((dept) => {
                const ytdPercent = (dept.ytd / dept.budgeted) * 100;
                return (
                  <TableRow key={dept.name} hover>
                    <TableCell>{dept.name}</TableCell>
                    <TableCell align="right">${dept.budgeted.toLocaleString()}</TableCell>
                    <TableCell align="right">${dept.ytd.toLocaleString()}</TableCell>
                    <TableCell align="right">${(dept.budgeted * 0.75).toLocaleString()}</TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LinearProgress
                          variant="determinate"
                          value={Math.min(ytdPercent, 100)}
                          sx={{ flexGrow: 1, height: 8, borderRadius: 4 }}
                        />
                        <Typography variant="caption">
                          {ytdPercent.toFixed(0)}%
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          Budget Details - {selectedCategory}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" paragraph>
            Detailed breakdown and historical trends for the {selectedCategory} budget category.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            This would show monthly trends, sub-categories, and variance analysis.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default BudgetingCenter;
