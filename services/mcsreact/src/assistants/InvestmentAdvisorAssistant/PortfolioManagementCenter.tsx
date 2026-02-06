import React from 'react';
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material/index.js';
import { PortfolioHolding } from './types';

const mockPortfolioHoldings: PortfolioHolding[] = [
  { symbol: 'AAPL', shares: 100, averageCost: 150.00, currentPrice: 171.20 },
  { symbol: 'MSFT', shares: 50, averageCost: 280.00, currentPrice: 292.10 },
  { symbol: 'GOOGL', shares: 75, averageCost: 130.00, currentPrice: 140.80 },
];

const PortfolioManagementCenter = () => {
  const calculateMarketValue = (holding: PortfolioHolding) => holding.shares * holding.currentPrice;
  const calculateProfitLoss = (holding: PortfolioHolding) => (holding.currentPrice - holding.averageCost) * holding.shares;

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Portfolio Management Center
      </Typography>
      <TableContainer component={Paper} elevation={2}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Symbol</TableCell>
              <TableCell>Shares</TableCell>
              <TableCell>Average Cost</TableCell>
              <TableCell>Current Price</TableCell>
              <TableCell>Market Value</TableCell>
              <TableCell>Profit/Loss</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {mockPortfolioHoldings.map((holding) => (
              <TableRow key={holding.symbol}>
                <TableCell>{holding.symbol}</TableCell>
                <TableCell>{holding.shares}</TableCell>
                <TableCell>${holding.averageCost.toFixed(2)}</TableCell>
                <TableCell>${holding.currentPrice.toFixed(2)}</TableCell>
                <TableCell>${calculateMarketValue(holding).toFixed(2)}</TableCell>
                <TableCell style={{ color: calculateProfitLoss(holding) >= 0 ? 'green' : 'red' }}>
                  ${calculateProfitLoss(holding).toFixed(2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default PortfolioManagementCenter;


