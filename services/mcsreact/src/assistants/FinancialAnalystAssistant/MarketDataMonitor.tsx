import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip } from '@mui/material/index.js';

interface MarketInstrument {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  lastUpdate: string;
}

const initialMarketData: MarketInstrument[] = [
  { symbol: 'AAPL', price: 171.20, change: 1.50, changePercent: 0.88, lastUpdate: '10:00:00 AM' },
  { symbol: 'MSFT', price: 292.10, change: -0.80, changePercent: -0.27, lastUpdate: '10:00:00 AM' },
  { symbol: 'GOOGL', price: 140.80, change: 0.25, changePercent: 0.18, lastUpdate: '10:00:00 AM' },
  { symbol: 'TSLA', price: 210.50, change: -3.20, changePercent: -1.50, lastUpdate: '10:00:00 AM' },
];

const MarketDataMonitor = () => {
  const [marketData, setMarketData] = useState<MarketInstrument[]>(initialMarketData);

  useEffect(() => {
    const interval = setInterval(() => {
      setMarketData(prevData =>
        prevData.map(instrument => {
          const newPrice = instrument.price + (Math.random() - 0.5) * 2; // Simulate price fluctuation
          const newChange = newPrice - instrument.price;
          const newChangePercent = (newChange / instrument.price) * 100;
          return {
            ...instrument,
            price: parseFloat(newPrice.toFixed(2)),
            change: parseFloat(newChange.toFixed(2)),
            changePercent: parseFloat(newChangePercent.toFixed(2)),
            lastUpdate: new Date().toLocaleTimeString(),
          };
        })
      );
    }, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, []);

  const getChangeColor = (change: number) => {
    if (change > 0) return 'green';
    if (change < 0) return 'red';
    return 'default';
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Market Data Monitor
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Symbol</TableCell>
                <TableCell>Price</TableCell>
                <TableCell>Change</TableCell>
                <TableCell>% Change</TableCell>
                <TableCell>Last Update</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {marketData.map((instrument) => (
                <TableRow key={instrument.symbol}>
                  <TableCell>{instrument.symbol}</TableCell>
                  <TableCell>${instrument.price.toFixed(2)}</TableCell>
                  <TableCell style={{ color: getChangeColor(instrument.change) }}>
                    {instrument.change > 0 ? '+' : ''}{instrument.change.toFixed(2)}
                  </TableCell>
                  <TableCell style={{ color: getChangeColor(instrument.change) }}>
                    {instrument.changePercent > 0 ? '+' : ''}{instrument.changePercent.toFixed(2)}%
                  </TableCell>
                  <TableCell>{instrument.lastUpdate}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};

export default MarketDataMonitor;


