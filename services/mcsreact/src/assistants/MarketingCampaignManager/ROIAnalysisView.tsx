import React from 'react';
import { List, Box, Typography, Paper, Grid, ListItem, ListItemText, Button, Select, MenuItem, FormControl, InputLabel } from '@mui/material/index.js';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ROIAnalysis } from './types';

interface ROIAnalysisViewProps {
  analyses: ROIAnalysis[];
  sendMessage: (message: string) => Promise<any>;
}

const ROIAnalysisView: React.FC<ROIAnalysisViewProps> = ({
  analyses,
  sendMessage
}) => {
  const [selectedCampaign, setSelectedCampaign] = React.useState<string>('all');

  const campaignIds = React.useMemo(() => {
    return Array.from(new Set(analyses.map(a => a.campaignId)));
  }, [analyses]);

  const filteredAnalyses = React.useMemo(() => {
    if (selectedCampaign === 'all') {
      return analyses;
    }
    return analyses.filter(a => a.campaignId === selectedCampaign);
  }, [analyses, selectedCampaign]);

  const chartData = React.useMemo(() => {
    return filteredAnalyses.map(analysis => ({
      name: `Campaign ${analysis.campaignId}`,
      ROI: analysis.roi,
      Cost: analysis.totalSpend,
      Revenue: analysis.totalRevenue
    }));
  }, [filteredAnalyses]);

  const handleGenerateReport = () => {
    sendMessage(`Generate detailed ROI report for campaign ${selectedCampaign}`);
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" gutterBottom>
          ROI Analysis View
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Campaign</InputLabel>
            <Select
              value={selectedCampaign}
              label="Campaign"
              onChange={(e) => setSelectedCampaign(e.target.value)}
            >
              <MenuItem value="all">All Campaigns</MenuItem>
              {campaignIds.map((id) => (
                <MenuItem key={id} value={id}>Campaign {id}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button variant="contained" onClick={handleGenerateReport}>
            Generate Report
          </Button>
        </Box>
      </Box>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Campaign ROI Overview
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={chartData}
                margin={{
                  top: 5,
                  right: 30,
                  left: 20,
                  bottom: 5,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value: number, name: string) => (name === 'ROI' ? `${value}%` : `$${value}`)} />
                <Legend />
                <Bar dataKey="ROI" fill="#8884d8" name="ROI" />
                <Bar dataKey="Cost" fill="#82ca9d" name="Cost" />
                <Bar dataKey="Revenue" fill="#ffc658" name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Key Metrics
            </Typography>
            <List>
              {filteredAnalyses.map((analysis) => (
                <ListItem key={analysis.id}>
                  <ListItemText
                    primary={`Campaign ${analysis.campaignId}: ROI ${analysis.roi}%`}
                    secondary={`Cost: $${analysis.totalSpend}, Revenue: $${analysis.totalRevenue}, CAC: $${analysis.customerAcquisitionCost}`}
                  />
                </ListItem>
              ))}
            </List>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default ROIAnalysisView;


