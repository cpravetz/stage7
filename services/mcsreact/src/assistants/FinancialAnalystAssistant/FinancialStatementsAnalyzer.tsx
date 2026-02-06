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
  Tabs,
  Tab,
  Card,
  CardContent,
  Grid,
  Chip
} from '@mui/material/index.js';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface IncomeStatementItem {
  category: string;
  q1: number;
  q2: number;
  q3: number;
  q4: number;
  total: number;
}

interface BalanceSheetItem {
  category: string;
  current: number;
  previous: number;
  change: number;
  changePercent: number;
}

interface FinancialRatio {
  name: string;
  value: number;
  target: number;
  status: 'good' | 'warning' | 'critical';
}

const mockIncomeStatement: IncomeStatementItem[] = [
  { category: 'Revenue', q1: 12500000, q2: 13200000, q3: 13800000, q4: 14500000, total: 54000000 },
  { category: 'Cost of Goods Sold', q1: -6250000, q2: -6600000, q3: -6900000, q4: -7250000, total: -27000000 },
  { category: 'Gross Profit', q1: 6250000, q2: 6600000, q3: 6900000, q4: 7250000, total: 27000000 },
  { category: 'Operating Expenses', q1: -3550000, q2: -3500000, q3: -3600000, q4: -3750000, total: -14400000 },
  { category: 'Operating Income', q1: 2700000, q2: 3100000, q3: 3300000, q4: 3500000, total: 12600000 },
  { category: 'Net Income', q1: 2430000, q2: 2790000, q3: 2970000, q4: 3150000, total: 11340000 },
];

const mockBalanceSheet: BalanceSheetItem[] = [
  { category: 'Cash & Equivalents', current: 15000000, previous: 12000000, change: 3000000, changePercent: 25.0 },
  { category: 'Accounts Receivable', current: 8000000, previous: 7500000, change: 500000, changePercent: 6.7 },
  { category: 'Inventory', current: 5000000, previous: 5500000, change: -500000, changePercent: -9.1 },
  { category: 'Total Current Assets', current: 28000000, previous: 25000000, change: 3000000, changePercent: 12.0 },
  { category: 'Property & Equipment', current: 12000000, previous: 11000000, change: 1000000, changePercent: 9.1 },
  { category: 'Total Assets', current: 40000000, previous: 36000000, change: 4000000, changePercent: 11.1 },
  { category: 'Current Liabilities', current: 8000000, previous: 9000000, change: -1000000, changePercent: -11.1 },
  { category: 'Long-term Debt', current: 10000000, previous: 12000000, change: -2000000, changePercent: -16.7 },
  { category: 'Total Liabilities', current: 18000000, previous: 21000000, change: -3000000, changePercent: -14.3 },
  { category: 'Shareholders Equity', current: 22000000, previous: 15000000, change: 7000000, changePercent: 46.7 },
];

const mockFinancialRatios: FinancialRatio[] = [
  { name: 'Current Ratio', value: 3.5, target: 2.0, status: 'good' },
  { name: 'Quick Ratio', value: 2.9, target: 1.5, status: 'good' },
  { name: 'Debt-to-Equity', value: 0.45, target: 0.5, status: 'good' },
  { name: 'ROE', value: 51.5, target: 15.0, status: 'good' },
  { name: 'Profit Margin', value: 21.0, target: 15.0, status: 'good' },
  { name: 'Operating Margin', value: 23.3, target: 18.0, status: 'good' },
];

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

const FinancialStatementsAnalyzer: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const quarterlyRevenue = mockIncomeStatement
    .find(item => item.category === 'Revenue');

  const revenueData = quarterlyRevenue ? [
    { quarter: 'Q1', revenue: quarterlyRevenue.q1 / 1000000 },
    { quarter: 'Q2', revenue: quarterlyRevenue.q2 / 1000000 },
    { quarter: 'Q3', revenue: quarterlyRevenue.q3 / 1000000 },
    { quarter: 'Q4', revenue: quarterlyRevenue.q4 / 1000000 },
  ] : [];

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Financial Statements Analyzer
      </Typography>

      <Tabs value={tabValue} onChange={handleTabChange} sx={{ mb: 2 }}>
        <Tab label="Income Statement" />
        <Tab label="Balance Sheet" />
        <Tab label="Financial Ratios" />
      </Tabs>

      {/* Income Statement Tab */}
      {tabValue === 0 && (
        <Box>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" gutterBottom>
                    Annual Revenue
                  </Typography>
                  <Typography variant="h4">
                    ${(mockIncomeStatement[0].total / 1000000).toFixed(1)}M
                  </Typography>
                  <Chip label="FY 2025" color="primary" size="small" sx={{ mt: 1 }} />
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" gutterBottom>
                    Net Income
                  </Typography>
                  <Typography variant="h4">
                    ${(mockIncomeStatement[5].total / 1000000).toFixed(1)}M
                  </Typography>
                  <Chip label="21% Margin" color="success" size="small" sx={{ mt: 1 }} />
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" gutterBottom>
                    Operating Income
                  </Typography>
                  <Typography variant="h4">
                    ${(mockIncomeStatement[4].total / 1000000).toFixed(1)}M
                  </Typography>
                  <Chip label="23.3% Margin" color="success" size="small" sx={{ mt: 1 }} />
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Quarterly Revenue Trend
            </Typography>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="quarter" />
                <YAxis label={{ value: 'Revenue ($M)', angle: -90, position: 'insideLeft' }} />
                <Tooltip formatter={(value: number) => `$${value.toFixed(1)}M`} />
                <Bar dataKey="revenue" fill="#1976d2" />
              </BarChart>
            </ResponsiveContainer>
          </Paper>

          <Paper elevation={2} sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Income Statement - FY 2025
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Category</TableCell>
                    <TableCell align="right">Q1</TableCell>
                    <TableCell align="right">Q2</TableCell>
                    <TableCell align="right">Q3</TableCell>
                    <TableCell align="right">Q4</TableCell>
                    <TableCell align="right"><strong>Annual Total</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {mockIncomeStatement.map((item) => (
                    <TableRow
                      key={item.category}
                      sx={{
                        bgcolor: ['Gross Profit', 'Operating Income', 'Net Income'].includes(item.category)
                          ? '#f5f5f5'
                          : 'inherit',
                      }}
                    >
                      <TableCell>
                        <strong>{item.category}</strong>
                      </TableCell>
                      <TableCell align="right">${(item.q1 / 1000000).toFixed(2)}M</TableCell>
                      <TableCell align="right">${(item.q2 / 1000000).toFixed(2)}M</TableCell>
                      <TableCell align="right">${(item.q3 / 1000000).toFixed(2)}M</TableCell>
                      <TableCell align="right">${(item.q4 / 1000000).toFixed(2)}M</TableCell>
                      <TableCell align="right">
                        <strong>${(item.total / 1000000).toFixed(2)}M</strong>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Box>
      )}

      {/* Balance Sheet Tab */}
      {tabValue === 1 && (
        <Box>
          <Paper elevation={2} sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Balance Sheet Analysis
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Category</TableCell>
                    <TableCell align="right">Current Period</TableCell>
                    <TableCell align="right">Previous Period</TableCell>
                    <TableCell align="right">Change</TableCell>
                    <TableCell align="right">Change %</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {mockBalanceSheet.map((item) => (
                    <TableRow
                      key={item.category}
                      sx={{
                        bgcolor: ['Total Current Assets', 'Total Assets', 'Total Liabilities', 'Shareholders Equity'].includes(item.category)
                          ? '#f5f5f5'
                          : 'inherit',
                      }}
                    >
                      <TableCell>
                        <strong>{item.category}</strong>
                      </TableCell>
                      <TableCell align="right">${(item.current / 1000000).toFixed(2)}M</TableCell>
                      <TableCell align="right">${(item.previous / 1000000).toFixed(2)}M</TableCell>
                      <TableCell
                        align="right"
                        sx={{ color: item.change > 0 ? 'success.main' : 'error.main' }}
                      >
                        {item.change > 0 ? '+' : ''}${(item.change / 1000000).toFixed(2)}M
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{ color: item.changePercent > 0 ? 'success.main' : 'error.main' }}
                      >
                        {item.changePercent > 0 ? '+' : ''}{item.changePercent.toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Box>
      )}

      {/* Financial Ratios Tab */}
      {tabValue === 2 && (
        <Box>
          <Paper elevation={2} sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Key Financial Ratios
            </Typography>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Ratio</TableCell>
                    <TableCell align="right">Current Value</TableCell>
                    <TableCell align="right">Target</TableCell>
                    <TableCell align="center">Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {mockFinancialRatios.map((ratio) => (
                    <TableRow key={ratio.name}>
                      <TableCell><strong>{ratio.name}</strong></TableCell>
                      <TableCell align="right">{ratio.value.toFixed(2)}{ratio.name.includes('Margin') || ratio.name === 'ROE' ? '%' : ''}</TableCell>
                      <TableCell align="right">{ratio.target.toFixed(2)}{ratio.name.includes('Margin') || ratio.name === 'ROE' ? '%' : ''}</TableCell>
                      <TableCell align="center">
                        <Chip
                          label={ratio.status.toUpperCase()}
                          color={
                            ratio.status === 'good' ? 'success' :
                            ratio.status === 'warning' ? 'warning' : 'error'
                          }
                          size="small"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Box>
      )}
    </Box>
  );
};

export default FinancialStatementsAnalyzer;
