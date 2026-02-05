import React from 'react';
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material/index.js';
import { StockData, CompanyFinancials } from './types';

const mockStockData: StockData[] = [
  { symbol: 'AAPL', date: '2026-03-01', open: 170.00, high: 172.50, low: 169.80, close: 171.20, volume: 80000000 },
  { symbol: 'MSFT', date: '2026-03-01', open: 290.00, high: 293.00, low: 289.50, close: 292.10, volume: 60000000 },
  { symbol: 'GOOGL', date: '2026-03-01', open: 140.00, high: 141.50, low: 139.70, close: 140.80, volume: 40000000 },
];

const mockCompanyFinancials: CompanyFinancials[] = [
  { symbol: 'AAPL', year: 2025, revenue: 380000000000, netIncome: 100000000000, eps: 6.20 },
  { symbol: 'MSFT', year: 2025, revenue: 220000000000, netIncome: 70000000000, eps: 9.30 },
];

const FinancialDataExplorer = () => {
  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Financial Data Explorer
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Recent Stock Data
        </Typography>
        <TableContainer sx={{ mb: 4 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Symbol</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Open</TableCell>
                <TableCell>High</TableCell>
                <TableCell>Low</TableCell>
                <TableCell>Close</TableCell>
                <TableCell>Volume</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {mockStockData.map((data) => (
                <TableRow key={data.symbol + data.date}>
                  <TableCell>{data.symbol}</TableCell>
                  <TableCell>{data.date}</TableCell>
                  <TableCell>${data.open.toFixed(2)}</TableCell>
                  <TableCell>${data.high.toFixed(2)}</TableCell>
                  <TableCell>${data.low.toFixed(2)}</TableCell>
                  <TableCell>${data.close.toFixed(2)}</TableCell>
                  <TableCell>{data.volume.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Typography variant="h6" gutterBottom>
          Company Financials (Latest Year)
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Symbol</TableCell>
                <TableCell>Year</TableCell>
                <TableCell>Revenue</TableCell>
                <TableCell>Net Income</TableCell>
                <TableCell>EPS</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {mockCompanyFinancials.map((data) => (
                <TableRow key={data.symbol + data.year}>
                  <TableCell>{data.symbol}</TableCell>
                  <TableCell>{data.year}</TableCell>
                  <TableCell>${(data.revenue / 1000000000).toFixed(1)}B</TableCell>
                  <TableCell>${(data.netIncome / 1000000000).toFixed(1)}B</TableCell>
                  <TableCell>${data.eps.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};

export default FinancialDataExplorer;


