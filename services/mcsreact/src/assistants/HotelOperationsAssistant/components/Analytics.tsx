import React from 'react';
import { Box, Typography, Paper, Grid, Card, CardContent, Table, TableCell, TableContainer, TableHead, TableRow, TableBody } from '@mui/material/index.js';
import { BarChart } from '@mui/x-charts';

import { LineChart } from '@mui/x-charts';

import { PieChart } from '@mui/x-charts';

interface AnalyticsProps {
  analyticsData: {
    occupancyRate: number;
    revenue: number;
    averageDailyRate: number;
    guestSatisfaction: number;
    roomOccupancyByType: Array<{ type: string; count: number; total: number }>;
    revenueByService: Array<{ service: string; amount: number }>;
    dailyOccupancy: Array<{ date: string; occupancy: number }>;
  } | null;
}

const Analytics: React.FC<AnalyticsProps> = ({ analyticsData }) => {
  // Mock data if no analytics data is provided
  const data = analyticsData || {
    occupancyRate: 75,
    revenue: 150000,
    averageDailyRate: 185,
    guestSatisfaction: 88,
    roomOccupancyByType: [
      { type: 'Standard', count: 45, total: 60 },
      { type: 'Deluxe', count: 28, total: 40 },
      { type: 'Suite', count: 12, total: 20 }
    ],
    revenueByService: [
      { service: 'Rooms', amount: 120000 },
      { service: 'Food & Beverage', amount: 25000 },
      { service: 'Spa', amount: 12000 },
      { service: 'Other Services', amount: 8000 }
    ],
    dailyOccupancy: Array.from({ length: 7 }, (_, i) => ({
      date: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toLocaleDateString(),
      occupancy: Math.floor(Math.random() * 80) + 50
    })).reverse()
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Hotel Operations Analytics
      </Typography>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid {...({ xs: 12, md: 3, item: true } as any)}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Occupancy Rate
              </Typography>
              <Typography variant="h4" component="div">
                {data.occupancyRate}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid {...({ xs: 12, md: 3, item: true } as any)}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Monthly Revenue
              </Typography>
              <Typography variant="h4" component="div">
                ${data.revenue.toLocaleString()}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid {...({ xs: 12, md: 3, item: true } as any)}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Avg Daily Rate
              </Typography>
              <Typography variant="h4" component="div">
                ${data.averageDailyRate}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid {...({ xs: 12, md: 3, item: true } as any)}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Guest Satisfaction
              </Typography>
              <Typography variant="h4" component="div">
                {data.guestSatisfaction}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid {...({ xs: 12, md: 6, item: true } as any)}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Room Occupancy by Type
            </Typography>
            <BarChart
              xAxis={[{ scaleType: 'band', data: data.roomOccupancyByType.map(r => r.type) }]}
              series={[
                { data: data.roomOccupancyByType.map(r => r.count), label: 'Occupied' },
                { data: data.roomOccupancyByType.map(r => r.total - r.count), label: 'Available' }
              ]}
              height={300}
            />
          </Paper>
        </Grid>
        <Grid {...({ xs: 12, md: 6, item: true } as any)}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Revenue by Service
            </Typography>
            <PieChart
              series={[
                {
                  data: data.revenueByService.map(r => ({
                    id: r.service,
                    value: r.amount,
                    label: r.service
                  })),
                  innerRadius: 30,
                  outerRadius: 100,
                  paddingAngle: 5,
                  cornerRadius: 5,
                }
              ]}
              height={300}
            />
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid {...({ xs: 12, md: 6, item: true } as any)}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Daily Occupancy Trend
            </Typography>
            <LineChart
              xAxis={[{ data: data.dailyOccupancy.map(d => d.date) }]}
              series={[{ data: data.dailyOccupancy.map(d => d.occupancy), label: 'Occupancy %' }]}
              height={300}
            />
          </Paper>
        </Grid>
        <Grid {...({ xs: 12, md: 6, item: true } as any)}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Room Occupancy Details
            </Typography>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Room Type</TableCell>
                    <TableCell>Occupied</TableCell>
                    <TableCell>Total</TableCell>
                    <TableCell>Occupancy %</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.roomOccupancyByType.map((roomType) => (
                    <TableRow key={roomType.type}>
                      <TableCell>{roomType.type}</TableCell>
                      <TableCell>{roomType.count}</TableCell>
                      <TableCell>{roomType.total}</TableCell>
                      <TableCell>{Math.round((roomType.count / roomType.total) * 100)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>

      <Box sx={{ mt: 3 }}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle1" gutterBottom>
            Revenue Breakdown
          </Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Service</TableCell>
                  <TableCell>Amount</TableCell>
                  <TableCell>Percentage</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.revenueByService.map((service) => (
                  <TableRow key={service.service}>
                    <TableCell>{service.service}</TableCell>
                    <TableCell>${service.amount.toLocaleString()}</TableCell>
                    <TableCell>{Math.round((service.amount / data.revenue) * 100)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>
    </Box>
  );
};

export default Analytics;

