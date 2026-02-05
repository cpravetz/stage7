import React, { useMemo } from 'react';
import { Box, Typography, Paper, Grid, Button, Alert } from '@mui/material/index.js';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Character } from './types';

interface Dialogue {
  id: string;
  characterId: string;
  characterName: string;
  text: string;
}

interface PlotPoint {
  id: string;
  sequenceNumber: number;
  description: string;
  actNumber?: number;
}

interface ScriptAnalysisDashboardProps {
  characters: Character[];
  dialogues: Dialogue[];
  plotPoints: PlotPoint[];
  onAnalyzeScript: () => void;
  onCheckCharacterConsistency: () => void;
  onEvaluatePacing: () => void;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#8B008B', '#FF6347', '#4169E1'];

const ScriptAnalysisDashboard: React.FC<ScriptAnalysisDashboardProps> = ({
  characters,
  dialogues,
  plotPoints,
  onAnalyzeScript,
  onCheckCharacterConsistency,
  onEvaluatePacing
}) => {
  const characterSpeakingTime = useMemo(() => {
    const speakingCounts: { [key: string]: number } = {};
    dialogues.forEach(d => {
      speakingCounts[d.characterName] = (speakingCounts[d.characterName] || 0) + d.text.split(' ').length;
    });
    return Object.entries(speakingCounts).map(([name, value]) => ({ name, value }));
  }, [dialogues]);

  const sceneDensity = useMemo(() => {
    const density: { [key: number]: number } = { 1: 0, 2: 0, 3: 0 };
    plotPoints.forEach(p => {
      const act = p.actNumber || 1;
      density[act as 1 | 2 | 3] = (density[act as 1 | 2 | 3] || 0) + 1;
    });
    return [
      { name: 'Act I', value: density[1] },
      { name: 'Act II', value: density[2] },
      { name: 'Act III', value: density[3] }
    ];
  }, [plotPoints]);

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Script Analysis Dashboard
      </Typography>
      
      <Alert severity="info" sx={{ mb: 3 }}>
        Analysis based on {characters.length} characters, {dialogues.length} dialogue lines, and {plotPoints.length} plot points
      </Alert>

      <Grid container spacing={3}>
        <Grid {...({ xs: 12, md: 6, item: true } as any)}>
          <Paper elevation={2} sx={{ p: 2, minHeight: 350 }}>
            <Typography variant="h6" gutterBottom>
              Character Speaking Time
            </Typography>
            {characterSpeakingTime.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={characterSpeakingTime}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    label
                  >
                    {characterSpeakingTime.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => `${value} words`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Alert severity="warning">No dialogue data available for analysis</Alert>
            )}
          </Paper>
        </Grid>
        
        <Grid {...({ xs: 12, md: 6, item: true } as any)}>
          <Paper elevation={2} sx={{ p: 2, minHeight: 350 }}>
            <Typography variant="h6" gutterBottom>
              Scene Density by Act
            </Typography>
            {sceneDensity.some(d => d.value > 0) ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={sceneDensity}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => `${value} scenes`} />
                  <Bar dataKey="value" fill="#0088FE" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Alert severity="warning">No plot point data available for analysis</Alert>
            )}
          </Paper>
        </Grid>
      </Grid>

      <Paper elevation={2} sx={{ p: 2, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Script Analysis Tools
        </Typography>
        <Grid container spacing={2}>
          <Grid {...({ xs: 12, sm: 6, md: 4, item: true } as any)}>
            <Button
              variant="contained"
              fullWidth
              onClick={onAnalyzeScript}
            >
              Analyze Script
            </Button>
          </Grid>
          <Grid {...({ xs: 12, sm: 6, md: 4, item: true } as any)}>
            <Button
              variant="contained"
              fullWidth
              onClick={onCheckCharacterConsistency}
            >
              Check Consistency
            </Button>
          </Grid>
          <Grid {...({ xs: 12, sm: 6, md: 4, item: true } as any)}>
            <Button
              variant="contained"
              fullWidth
              onClick={onEvaluatePacing}
            >
              Evaluate Pacing
            </Button>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default ScriptAnalysisDashboard;


