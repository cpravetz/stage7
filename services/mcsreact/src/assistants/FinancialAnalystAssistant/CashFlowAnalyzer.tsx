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
  Card,
  CardContent,
  Grid,
  Chip,
  Button,
  ToggleButtonGroup,
  ToggleButton
} from '@mui/material/index.js';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import WarningIcon from '@mui/icons-material/Warning';

interface CashFlowItem {
  period: string;
  operating: number;
  investing: number;
  financing: number;
  netChange: number;
  endingBalance: number;
}

interface CashFlowCategory {
  category: string;
  q1: number;
  q2: number;
  q3: number;
  q4: number;
  total: number;
}

interface CashPosition {
  date: string;
  available: number;
  committed: number;
  projected: number;
}

const mockQuarterlyCashFlow: CashFlowItem[] = [
  { period: 'Q1 2025', operating: 3200000, investing: -800000, financing: -500000, netChange: 1900000, endingBalance: 12900000 },
  { period: 'Q2 2025', operating: 3500000, investing: -600000, financing: -400000, netChange: 2500000, endingBalance: 15400000 },
  { period: 'Q3 2025', operating: 3800000, investing: -700000, financing: -300000, netChange: 2800000, endingBalance: 18200000 },
  { period: 'Q4 2025', operating: 4000000, investing: -1000000, financing: -500000, netChange: 2500000, endingBalance: 20700000 },
];

const mockCashFlowBreakdown: CashFlowCategory[] = [
  { category: 'Net Income', q1: 2430000, q2: 2790000, q3: 2970000, q4: 3150000, total: 11340000 },
  { category: 'Depreciation & Amortization', q1: 400000, q2: 420000, q3: 440000, q4: 460000, total: 1720000 },
  { category: 'Changes in Working Capital', q1: 370000, q2: 290000, q3: 390000, q4: 390000, total: 1440000 },
  { category: 'Operating Cash Flow', q1: 3200000, q2: 3500000, q3: 3800000, q4: 4000000, total: 14500000 },
  { category: 'Capital Expenditures', q1: -800000, q2: -600000, q3: -700000, q4: -1000000, total: -3100000 },
  { category: 'Free Cash Flow', q1: 2400000, q2: 2900000, q3: 3100000, q4: 3000000, total: 11400000 },
];

const mockCashPosition: CashPosition[] = [
  { date: 'Jan', available: 12000000, committed: 2000000, projected: 13500000 },
  { date: 'Feb', available: 12500000, committed: 2200000, projected: 14000000 },
  { date: 'Mar', available: 13000000, committed: 2100000, projected: 14500000 },
  { date: 'Apr', available: 14000000, committed: 2300000, projected: 15500000 },
  { date: 'May', available: 15000000, committed: 2400000, projected: 16500000 },
  { date: 'Jun', available: 15500000, committed: 2200000, projected: 17000000 },
];

const CashFlowAnalyzer: React.FC = () => {
  const [viewType, setViewType] = useState<'quarterly' | 'annual'>('quarterly');

  const handleViewChange = (
    event: React.MouseEvent<HTMLElement>,
    newView: 'quarterly' | 'annual' | null,
  ) => {
    if (newView !== null) {
      setViewType(newView);
    }
  };

  const totalOperating = mockQuarterlyCashFlow.reduce((sum, item) => sum + item.operating, 0);
  const totalInvesting = mockQuarterlyCashFlow.reduce((sum, item) => sum + item.investing, 0);
  const totalFinancing = mockQuarterlyCashFlow.reduce((sum, item) => sum + item.financing, 0);
  const totalFreeCashFlow = mockCashFlowBreakdown.find(item => item.category === 'Free Cash Flow')?.total || 0;

  const cashBurnRate = -totalInvesting / 12; // Monthly average
  const runwayMonths = Math.floor(mockQuarterlyCashFlow[3].endingBalance / cashBurnRate);

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Cash Flow Analyzer
      </Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Operating Cash Flow
              </Typography>
              <Typography variant="h5">
                ${(totalOperating / 1000000).toFixed(1)}M
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                <TrendingUpIcon color="success" fontSize="small" />
                <Typography variant="caption" color="success.main" sx={{ ml: 0.5 }}>
                  +18% YoY
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Free Cash Flow
              </Typography>
              <Typography variant="h5">
                ${(totalFreeCashFlow / 1000000).toFixed(1)}M
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                <TrendingUpIcon color="success" fontSize="small" />
                <Typography variant="caption" color="success.main" sx={{ ml: 0.5 }}>
                  +22% YoY
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Cash Balance
              </Typography>
              <Typography variant="h5">
                ${(mockQuarterlyCashFlow[3].endingBalance / 1000000).toFixed(1)}M
              </Typography>
              <Chip label="Strong Position" color="success" size="small" sx={{ mt: 1 }} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Cash Runway
              </Typography>
              <Typography variant="h5">
                {runwayMonths} months
              </Typography>
              <Chip label="Healthy" color="primary" size="small" sx={{ mt: 1 }} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            Cash Flow Trend
          </Typography>
          <ToggleButtonGroup
            value={viewType}
            exclusive
            onChange={handleViewChange}
            size="small"
          >
            <ToggleButton value="quarterly">Quarterly</ToggleButton>
            <ToggleButton value="annual">Annual</ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={mockQuarterlyCashFlow}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="period" />
            <YAxis label={{ value: 'Cash Flow ($M)', angle: -90, position: 'insideLeft' }} />
            <Tooltip formatter={(value: number) => `$${(value / 1000000).toFixed(2)}M`} />
            <Legend />
            <Bar dataKey="operating" fill="#2e7d32" name="Operating" />
            <Bar dataKey="investing" fill="#d32f2f" name="Investing" />
            <Bar dataKey="financing" fill="#1976d2" name="Financing" />
            <Line
              type="monotone"
              dataKey="endingBalance"
              stroke="#ff6f00"
              strokeWidth={3}
              name="Cash Balance"
              dot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </Paper>

      <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Cash Flow Statement - FY 2025
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
              {mockCashFlowBreakdown.map((item) => (
                <TableRow
                  key={item.category}
                  sx={{
                    bgcolor: ['Operating Cash Flow', 'Free Cash Flow'].includes(item.category)
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

      <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Monthly Cash Position
        </Typography>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={mockCashPosition}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis label={{ value: 'Amount ($M)', angle: -90, position: 'insideLeft' }} />
            <Tooltip formatter={(value: number) => `$${(value / 1000000).toFixed(1)}M`} />
            <Legend />
            <Line type="monotone" dataKey="available" stroke="#2e7d32" strokeWidth={2} name="Available Cash" />
            <Line type="monotone" dataKey="committed" stroke="#d32f2f" strokeWidth={2} name="Committed" strokeDasharray="5 5" />
            <Line type="monotone" dataKey="projected" stroke="#1976d2" strokeWidth={2} name="Projected" strokeDasharray="3 3" />
          </LineChart>
        </ResponsiveContainer>
      </Paper>

      <Paper elevation={2} sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Cash Flow Actions
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button variant="contained">
            Generate Cash Flow Report
          </Button>
          <Button variant="outlined">
            Analyze Working Capital
          </Button>
          <Button variant="outlined">
            Forecast Cash Position
          </Button>
          <Button variant="outlined">
            Optimize Cash Usage
          </Button>
        </Box>
      </Paper>
    </Box>
  );
};

export default CashFlowAnalyzer;
