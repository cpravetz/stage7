// services/mcsreact/src/pm-assistant/rich-output/DataAnalysisChart.tsx
import React, { useState } from 'react';
import { Card, CardHeader, CardContent, Select, MenuItem, FormControl, InputLabel, Box, Typography, Button, Chip } from '@mui/material/index.js';
import { DataAnalysisChartProps } from '../types';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter, ZAxis } from 'recharts';

const DataAnalysisChart: React.FC<DataAnalysisChartProps> = ({
  title,
  data,
  chartType = 'bar',
  xAxisLabel,
  yAxisLabel,
  insights = [],
  onExport
}) => {
  const [selectedChartType, setSelectedChartType] = useState(chartType);

  // Color palette for charts
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#A4DE6C'];

  const renderChart = () => {
    switch (selectedChartType) {
      case 'bar':
        return (
          <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" label={{ value: xAxisLabel, position: 'insideBottom', offset: -5 }} />
            <YAxis label={{ value: yAxisLabel, angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="value" fill="#007bff" name="Value" />
          </BarChart>
        );

      case 'line':
        return (
          <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" label={{ value: xAxisLabel, position: 'insideBottom', offset: -5 }} />
            <YAxis label={{ value: yAxisLabel, angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="value" stroke="#007bff" activeDot={{ r: 8 }} name="Value" />
          </LineChart>
        );

      case 'pie':
        return (
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
              nameKey="label"
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        );

      case 'scatter':
        return (
          <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid />
            <XAxis dataKey="label" label={{ value: xAxisLabel, position: 'insideBottom', offset: -5 }} />
            <YAxis label={{ value: yAxisLabel, angle: -90, position: 'insideLeft' }} />
            <ZAxis dataKey="value" range={[10, 1000]} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
            <Legend />
            <Scatter name="Data Points" data={data} fill="#007bff" />
          </ScatterChart>
        );

      default:
        return <Typography>Unsupported chart type</Typography>;
    }
  };

  return (
    <Card sx={{ mb: 2, boxShadow: 3 }}>
      <CardHeader
        title={title}
        action={
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Chart Type</InputLabel>
            <Select
              value={selectedChartType}
              label="Chart Type"
              onChange={(e) => setSelectedChartType(e.target.value as 'bar' | 'line' | 'pie' | 'scatter')}
            >
              <MenuItem value="bar">Bar Chart</MenuItem>
              <MenuItem value="line">Line Chart</MenuItem>
              <MenuItem value="pie">Pie Chart</MenuItem>
              <MenuItem value="scatter">Scatter Plot</MenuItem>
            </Select>
          </FormControl>
        }
      />
      <CardContent>
        <Box height={300} mb={2}>
          <ResponsiveContainer width="100%" height="100%">
            {renderChart()}
          </ResponsiveContainer>
        </Box>

        {insights.length > 0 && (
          <Box mt={3}>
            <Typography variant="subtitle1" gutterBottom>
              Key Insights:
            </Typography>
            <Box display="flex" flexWrap="wrap" gap={1}>
              {insights.map((insight, index) => (
                <Chip key={index} label={insight} variant="outlined" />
              ))}
            </Box>
          </Box>
        )}

        <Box display="flex" justifyContent="flex-end" gap={1} mt={2}>
          {onExport && (
            <Button
              variant="outlined"
              size="small"
              onClick={() => onExport('png')}
            >
              Export as PNG
            </Button>
          )}
          {onExport && (
            <Button
              variant="outlined"
              size="small"
              onClick={() => onExport('csv')}
            >
              Export as CSV
            </Button>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default DataAnalysisChart;

