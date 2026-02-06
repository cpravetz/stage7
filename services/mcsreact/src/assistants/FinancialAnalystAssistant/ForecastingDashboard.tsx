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
  Grid,
  Card,
  CardContent,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel
} from '@mui/material/index.js';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface ForecastData {
  period: string;
  revenue: number;
  expenses: number;
  profit: number;
  forecastType: 'actual' | 'forecast';
}

interface ScenarioForecast {
  scenario: string;
  q1: number;
  q2: number;
  q3: number;
  q4: number;
  total: number;
  confidence: number;
}

const mockHistoricalData: ForecastData[] = [
  { period: 'Q1 2025', revenue: 12500000, expenses: 9800000, profit: 2700000, forecastType: 'actual' },
  { period: 'Q2 2025', revenue: 13200000, expenses: 10100000, profit: 3100000, forecastType: 'actual' },
  { period: 'Q3 2025', revenue: 13800000, expenses: 10500000, profit: 3300000, forecastType: 'actual' },
  { period: 'Q4 2025', revenue: 14500000, expenses: 11000000, profit: 3500000, forecastType: 'actual' },
];

const mockForecastData: ForecastData[] = [
  { period: 'Q1 2026', revenue: 15200000, expenses: 11400000, profit: 3800000, forecastType: 'forecast' },
  { period: 'Q2 2026', revenue: 16000000, expenses: 11900000, profit: 4100000, forecastType: 'forecast' },
  { period: 'Q3 2026', revenue: 16800000, expenses: 12400000, profit: 4400000, forecastType: 'forecast' },
  { period: 'Q4 2026', revenue: 17500000, expenses: 12900000, profit: 4600000, forecastType: 'forecast' },
];

const mockScenarioData: ScenarioForecast[] = [
  { scenario: 'Conservative', q1: 14500000, q2: 15000000, q3: 15500000, q4: 16000000, total: 61000000, confidence: 85 },
  { scenario: 'Base Case', q1: 15200000, q2: 16000000, q3: 16800000, q4: 17500000, total: 65500000, confidence: 70 },
  { scenario: 'Optimistic', q1: 16000000, q2: 17200000, q3: 18400000, q4: 19500000, total: 71100000, confidence: 50 },
];

const ForecastingDashboard: React.FC = () => {
  const [forecastHorizon, setForecastHorizon] = useState('quarterly');
  const [selectedScenario, setSelectedScenario] = useState('Base Case');

  const allData = [...mockHistoricalData, ...mockForecastData];

  const handleGenerateForecast = () => {
    console.log('Generating forecast with horizon:', forecastHorizon);
  };

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Financial Forecasting Dashboard
      </Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Projected Annual Revenue
              </Typography>
              <Typography variant="h4">
                ${(mockForecastData.reduce((sum, item) => sum + item.revenue, 0) / 1000000).toFixed(1)}M
              </Typography>
              <Chip label="+12% YoY" color="success" size="small" sx={{ mt: 1 }} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Projected Net Profit
              </Typography>
              <Typography variant="h4">
                ${(mockForecastData.reduce((sum, item) => sum + item.profit, 0) / 1000000).toFixed(1)}M
              </Typography>
              <Chip label="+15% YoY" color="success" size="small" sx={{ mt: 1 }} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Forecast Confidence
              </Typography>
              <Typography variant="h4">
                70%
              </Typography>
              <Chip label="Base Case" color="primary" size="small" sx={{ mt: 1 }} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            Revenue & Profit Forecast
          </Typography>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Forecast Period</InputLabel>
            <Select
              value={forecastHorizon}
              label="Forecast Period"
              onChange={(e) => setForecastHorizon(e.target.value)}
            >
              <MenuItem value="monthly">Monthly</MenuItem>
              <MenuItem value="quarterly">Quarterly</MenuItem>
              <MenuItem value="annual">Annual</MenuItem>
            </Select>
          </FormControl>
        </Box>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={allData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="period" />
            <YAxis />
            <Tooltip formatter={(value: number) => `$${(value / 1000000).toFixed(1)}M`} />
            <Legend />
            <Line
              type="monotone"
              dataKey="revenue"
              stroke="#1976d2"
              strokeWidth={2}
              name="Revenue"
            />
            <Line
              type="monotone"
              dataKey="profit"
              stroke="#2e7d32"
              strokeWidth={2}
              name="Profit"
            />
          </LineChart>
        </ResponsiveContainer>
      </Paper>

      <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Scenario Analysis - 2026 Revenue Projections
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Scenario</TableCell>
                <TableCell align="right">Q1</TableCell>
                <TableCell align="right">Q2</TableCell>
                <TableCell align="right">Q3</TableCell>
                <TableCell align="right">Q4</TableCell>
                <TableCell align="right">Annual Total</TableCell>
                <TableCell align="center">Confidence</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {mockScenarioData.map((scenario) => (
                <TableRow
                  key={scenario.scenario}
                  hover
                  selected={scenario.scenario === selectedScenario}
                  sx={{ cursor: 'pointer' }}
                  onClick={() => setSelectedScenario(scenario.scenario)}
                >
                  <TableCell>
                    <strong>{scenario.scenario}</strong>
                  </TableCell>
                  <TableCell align="right">${(scenario.q1 / 1000000).toFixed(1)}M</TableCell>
                  <TableCell align="right">${(scenario.q2 / 1000000).toFixed(1)}M</TableCell>
                  <TableCell align="right">${(scenario.q3 / 1000000).toFixed(1)}M</TableCell>
                  <TableCell align="right">${(scenario.q4 / 1000000).toFixed(1)}M</TableCell>
                  <TableCell align="right">
                    <strong>${(scenario.total / 1000000).toFixed(1)}M</strong>
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={`${scenario.confidence}%`}
                      color={scenario.confidence > 70 ? 'success' : scenario.confidence > 50 ? 'primary' : 'warning'}
                      size="small"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Paper elevation={2} sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Forecast Actions
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button variant="contained" onClick={handleGenerateForecast}>
            Generate New Forecast
          </Button>
          <Button variant="outlined">
            Export Forecast Report
          </Button>
          <Button variant="outlined">
            Compare Scenarios
          </Button>
          <Button variant="outlined">
            Update Assumptions
          </Button>
        </Box>
      </Paper>
    </Box>
  );
};

export default ForecastingDashboard;
