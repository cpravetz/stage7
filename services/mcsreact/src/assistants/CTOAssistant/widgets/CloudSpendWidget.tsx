import React from 'react';
import { Paper, Typography } from '@mui/material';
import { LineChart } from '@mui/x-charts/LineChart';

interface CloudSpendWidgetProps {
  data: {
    labels: string[];
    datasets: {
      label: string;
      data: number[];
      color: string;
    }[];
  };
}

export const CloudSpendWidget: React.FC<CloudSpendWidgetProps> = ({ data }) => {
  return (
    <Paper elevation={3} sx={{ p: 2, height: '100%' }}>
      <Typography variant="h6" gutterBottom>Cloud Spend</Typography>
      <LineChart
        height={300}
        series={data.datasets}
        xAxis={[{ scaleType: 'point', data: data.labels }]}
        sx={{
          '.MuiLineElement-root': {
            strokeWidth: 2,
          },
        }}
      />
    </Paper>
  );
};


