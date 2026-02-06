import React from 'react';
import { Box, Typography, Paper, Grid, Button, TextField } from '@mui/material/index.js';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { SalesForecast } from './types';

interface SalesForecastingInterfaceProps {
  forecasts: SalesForecast[];
  onCreateForecast: (forecast: SalesForecast) => void;
  onUpdateForecast: (id: string, updates: Partial<SalesForecast>) => void;
  sendMessage: (message: string) => void;
}

const SalesForecastingInterface: React.FC<SalesForecastingInterfaceProps> = ({ 
  forecasts, 
  onCreateForecast, 
  onUpdateForecast, 
  sendMessage 
}) => {
  const handleCreateForecast = () => {
    const newForecast: SalesForecast = {
      period: `Q${Math.floor(Math.random() * 4) + 1} 2026`,
      forecastAmount: Math.floor(Math.random() * 200000) + 100000,
      pipelineAmount: Math.floor(Math.random() * 150000) + 80000,
      confidenceLevel: ['High', 'Medium', 'Low'][Math.floor(Math.random() * 3)] as 'High' | 'Medium' | 'Low'
    };
    onCreateForecast(newForecast);
  };

  // Convert forecasts to chart data format
  const chartData = forecasts.map((forecast, index) => ({
    period: forecast.period,
    forecast: forecast.forecastAmount,
    pipeline: forecast.pipelineAmount
  }));

  return (
    <Box sx={{ mt: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" gutterBottom>
          Sales Forecasting
        </Typography>
        <Button 
          variant="contained"
          color="primary"
          onClick={handleCreateForecast}
          size="small"
        >
          Generate Forecast
        </Button>
      </Box>
      
      {forecasts.length === 0 ? (
        <Typography variant="body1" color="text.secondary">
          No forecasts available. Click "Generate Forecast" to create your first forecast.
        </Typography>
      ) : (
        <Paper elevation={2} sx={{ p: 2 }}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Sales Forecast vs. Pipeline
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="forecast" stroke="#8884d8" name="Forecasted Sales" />
                  <Line type="monotone" dataKey="pipeline" stroke="#82ca9d" name="Pipeline Value" />
                </LineChart>
              </ResponsiveContainer>
            </Grid>
            
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Forecast Details
              </Typography>
              <Grid container spacing={2}>
                {forecasts.map((forecast, index) => (
                  <Grid item xs={12} sm={6} md={4} key={index}>
                    <Paper elevation={1} sx={{ p: 2 }}>
                      <Typography variant="subtitle1">{forecast.period}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Forecast: ${forecast.forecastAmount.toLocaleString()}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Pipeline: ${forecast.pipelineAmount.toLocaleString()}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Confidence: {forecast.confidenceLevel}
                      </Typography>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            </Grid>
          </Grid>
        </Paper>
      )}
    </Box>
  );
};

export default SalesForecastingInterface;


