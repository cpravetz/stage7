import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Grid, CircularProgress, Alert } from '@mui/material/index.js';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { educationAssistantClient } from '../shared/assistantClients'; // Import the client

interface StudentPerformance {
  name: string; // Student name or group
  avgAssessmentScore: number; // Average score across assessments
  learningPlanCompletion: number; // Percentage of learning plans completed
  engagementHours: number; // Hours engaged with platform
}

interface PerformanceAnalyticsDashboardProps {
  conversationId: string | null;
  client: typeof educationAssistantClient;
  setError: (error: string | null) => void;
}

const PerformanceAnalyticsDashboard: React.FC<PerformanceAnalyticsDashboardProps> = ({ conversationId, client, setError }) => {
  const [studentPerformanceData, setStudentPerformanceData] = useState<StudentPerformance[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPerformanceData = async () => {
      if (!conversationId) return;

      setIsLoading(true);
      try {
        const contextData = await client.getContext(conversationId);
        const fetchedPerformance = contextData.contextItems
          .filter(item => item.type === 'student_performance') // Assuming a 'student_performance' context item type
          .map(item => ({
            name: item.title,
            avgAssessmentScore: (item as any).avgAssessmentScore || 0,
            learningPlanCompletion: (item as any).learningPlanCompletion || 0,
            engagementHours: (item as any).engagementHours || 0,
          }));
        setStudentPerformanceData(fetchedPerformance);
      } catch (err) {
        console.error('Error fetching performance data:', err);
        setError('Failed to load student performance data.');
        setStudentPerformanceData([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPerformanceData();
  }, [conversationId, client, setError]);

  if (isLoading) {
    return (
      <Box sx={{ mt: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (studentPerformanceData.length === 0) {
    return (
      <Box sx={{ mt: 4 }}>
        <Typography variant="h5" gutterBottom>
          Performance Analytics Dashboard
        </Typography>
        <Paper elevation={2} sx={{ p: 2 }}>
          <Alert severity="info">No student performance data found.</Alert>
        </Paper>
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Performance Analytics Dashboard
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Average Assessment Scores
            </Typography>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={studentPerformanceData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value: number) => `${value}%`} />
                <Legend />
                <Bar dataKey="avgAssessmentScore" fill="#8884d8" name="Avg. Score" />
              </BarChart>
            </ResponsiveContainer>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Learning Plan Completion Rate
            </Typography>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={studentPerformanceData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value: number) => `${value}%`} />
                <Legend />
                <Bar dataKey="learningPlanCompletion" fill="#82ca9d" name="Completion Rate" />
              </BarChart>
            </ResponsiveContainer>
          </Grid>
          <Grid {...({ xs: 12, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Student Engagement Hours
            </Typography>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={studentPerformanceData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="engagementHours" stroke="#ffc658" name="Engagement Hours" />
              </LineChart>
            </ResponsiveContainer>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default PerformanceAnalyticsDashboard;


