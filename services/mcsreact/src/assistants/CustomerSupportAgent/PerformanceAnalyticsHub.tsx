import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Grid, CircularProgress, Alert } from '@mui/material/index.js';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { AgentPerformance } from '../types'; // Import from shared types
import { CustomerSupportAssistantClient } from './CustomerSupportAssistantClient'; // Import the client

interface PerformanceAnalyticsHubProps {
  conversationId: string | null;
  client: CustomerSupportAssistantClient;
  setError: (message: string | null) => void;
}

const PerformanceAnalyticsHub: React.FC<PerformanceAnalyticsHubProps> = ({ conversationId, client, setError }) => {
  const [agentPerformanceData, setAgentPerformanceData] = useState<AgentPerformance[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPerformanceData = async () => {
    if (!conversationId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await client.getPerformanceAnalytics(conversationId);
      setAgentPerformanceData(data);
    } catch (err) {
      console.error('Error fetching performance analytics:', err);
      setError(`Error fetching performance analytics: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPerformanceData();
  }, [conversationId, client]); // Re-fetch when conversationId or client changes

  if (isLoading) {
    return (
      <Box sx={{ mt: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ ml: 2 }}>Loading Performance Data...</Typography>
      </Box>
    );
  }

  if (agentPerformanceData.length === 0) {
    return (
      <Box sx={{ mt: 4 }}>
        <Typography variant="h5" gutterBottom>
          Performance Analytics Hub
        </Typography>
        <Alert severity="info">No performance data found.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Performance Analytics Hub
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Agent Performance: Tickets Resolved
            </Typography>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={agentPerformanceData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="ticketsResolved" fill="#8884d8" name="Tickets Resolved" />
              </BarChart>
            </ResponsiveContainer>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Agent Performance: Avg. Resolution Time (Hours)
            </Typography>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={agentPerformanceData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="avgResolutionTime" fill="#82ca9d" name="Avg. Resolution Time" />
              </BarChart>
            </ResponsiveContainer>
          </Grid>
          <Grid {...({ xs: 12, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Agent Performance: CSAT Score
            </Typography>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={agentPerformanceData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value: number) => `${value}%`} />
                <Legend />
                <Bar dataKey="csatScore" fill="#ffc658" name="CSAT Score" />
              </BarChart>
            </ResponsiveContainer>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default PerformanceAnalyticsHub;


