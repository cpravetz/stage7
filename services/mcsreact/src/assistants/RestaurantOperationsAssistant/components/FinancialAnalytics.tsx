import React from 'react';
import { Box, Typography, Paper, Grid, Card, CardContent, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material/index.js';
import { BarChart } from '@mui/x-charts';
import { LineChart } from '@mui/x-charts';
import { PieChart } from '@mui/x-charts';

interface DailyRevenue {
  date: string;
  amount: number;
}

interface RevenueCategory {
  category: string;
  amount: number;
}

interface ExpenseCategory {
  category: string;
  amount: number;
}

interface FinancialData {
  dailyRevenue: DailyRevenue[];
  revenueByCategory: RevenueCategory[];
  expenseBreakdown: ExpenseCategory[];
  profitMargin: number;
  averageTicketSize: number;
  tableTurnoverRate: number;
  laborCostPercentage: number;
  foodCostPercentage: number;
}

interface FinancialAnalyticsProps {
  financialData: FinancialData | null;
  sendMessage: (message: string) => Promise<void>;
}

const FinancialAnalytics: React.FC<FinancialAnalyticsProps> = ({ financialData, sendMessage }) => {
  // Use provided financialData or fallback to default values
  const data = financialData || {
    dailyRevenue: [],
    revenueByCategory: [],
    expenseBreakdown: [],
    profitMargin: 0,
    averageTicketSize: 0,
    tableTurnoverRate: 0,
    laborCostPercentage: 0,
    foodCostPercentage: 0
  };

  // Helper to ensure chart data is not empty
  const defaultChartData = [{ category: 'N/A', amount: 0 }];

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Financial Analytics
      </Typography>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid {...({ xs: 12, md: 3, item: true } as any)}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Profit Margin
              </Typography>
              <Typography variant="h4" component="div">
                {data.profitMargin.toFixed(1)}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid {...({ xs: 12, md: 3, item: true } as any)}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Avg Ticket Size
              </Typography>
              <Typography variant="h4" component="div">
                ${data.averageTicketSize.toFixed(2)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid {...({ xs: 12, md: 3, item: true } as any)}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Table Turnover
              </Typography>
              <Typography variant="h4" component="div">
                {data.tableTurnoverRate.toFixed(1)}x
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid {...({ xs: 12, md: 3, item: true } as any)}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Labor Cost %
              </Typography>
              <Typography variant="h4" component="div">
                {data.laborCostPercentage.toFixed(1)}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid {...({ xs: 12, md: 6, item: true } as any)}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Daily Revenue
            </Typography>
            {data.dailyRevenue.length > 0 ? (
              <LineChart
                xAxis={[{ data: data.dailyRevenue.map(d => d.date) }]}
                series={[{ data: data.dailyRevenue.map(d => d.amount), label: 'Revenue ($)' }]}
                height={300}
              />
            ) : (
              <Box sx={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography color="text.secondary">No daily revenue data available.</Typography>
              </Box>
            )}
          </Paper>
        </Grid>
        <Grid {...({ xs: 12, md: 6, item: true } as any)}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Revenue by Category
            </Typography>
            {data.revenueByCategory.length > 0 ? (
              <PieChart
                series={[
                  {
                    data: data.revenueByCategory.map(r => ({
                      id: r.category,
                      value: r.amount,
                      label: r.category
                    })),
                    innerRadius: 30,
                    outerRadius: 100,
                    paddingAngle: 5,
                    cornerRadius: 5,
                  }
                ]}
                height={300}
              />
            ) : (
              <Box sx={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography color="text.secondary">No revenue by category data available.</Typography>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid {...({ xs: 12, md: 6, item: true } as any)}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Expense Breakdown
            </Typography>
            {data.expenseBreakdown.length > 0 ? (
              <BarChart
                xAxis={[{ scaleType: 'band', data: data.expenseBreakdown.map(e => e.category) }]}
                series={[{ data: data.expenseBreakdown.map(e => e.amount), label: 'Amount ($)' }]}
                height={300}
              />
            ) : (
              <Box sx={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography color="text.secondary">No expense breakdown data available.</Typography>
              </Box>
            )}
          </Paper>
        </Grid>
        <Grid {...({ xs: 12, md: 6, item: true } as any)}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Key Metrics
            </Typography>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Metric</TableCell>
                    <TableCell>Value</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow>
                    <TableCell>Total Revenue (Week)</TableCell>
                    <TableCell>${data.dailyRevenue.reduce((sum, d) => sum + d.amount, 0).toLocaleString()}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Total Expenses (Week)</TableCell>
                    <TableCell>${data.expenseBreakdown.reduce((sum, e) => sum + e.amount, 0).toLocaleString()}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Food Cost Percentage</TableCell>
                    <TableCell>{data.foodCostPercentage.toFixed(1)}%</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Labor Cost Percentage</TableCell>
                    <TableCell>{data.laborCostPercentage.toFixed(1)}%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>

      <Box sx={{ mt: 3 }}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle1" gutterBottom>
            Revenue Breakdown
          </Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Category</TableCell>
                  <TableCell>Amount</TableCell>
                  <TableCell>Percentage</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.revenueByCategory.length > 0 ? (
                  data.revenueByCategory.map((category) => (
                    <TableRow key={category.category}>
                      <TableCell>{category.category}</TableCell>
                      <TableCell>${category.amount.toLocaleString()}</TableCell>
                      <TableCell>{Math.round((category.amount / data.revenueByCategory.reduce((sum, c) => sum + c.amount, 0)) * 100)}%</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3}>No revenue category data available.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>
    </Box>
  );
};

export default FinancialAnalytics;

