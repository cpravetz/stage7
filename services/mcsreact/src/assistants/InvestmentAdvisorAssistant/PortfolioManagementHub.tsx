import React, { useState } from 'react';
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField } from '@mui/material/index.js';
import { Portfolio } from './types';

interface PortfolioManagementHubProps {
  onCreatePortfolio?: (portfolio: Portfolio) => void;
  onUpdatePortfolio?: (portfolioId: string, updates: Partial<Portfolio>) => void;
  onRebalancePortfolio?: (portfolioId: string) => void;
}

const mockPortfolios: Portfolio[] = [
  { id: 'p1', name: 'Growth Portfolio', holdings: [{ symbol: 'AAPL', percentage: 0.30 }, { symbol: 'MSFT', percentage: 0.25 }], currentValue: 150000 },
  { id: 'p2', name: 'Income Portfolio', holdings: [{ symbol: 'JNJ', percentage: 0.40 }, { symbol: 'PFE', percentage: 0.35 }], currentValue: 80000 },
];

const PortfolioManagementHub: React.FC<PortfolioManagementHubProps> = ({ onCreatePortfolio, onUpdatePortfolio, onRebalancePortfolio }) => {
  const [portfolios, setPortfolios] = useState<Portfolio[]>(mockPortfolios);
  const [openDialog, setOpenDialog] = useState<boolean>(false);
  const [currentPortfolio, setCurrentPortfolio] = useState<Portfolio | null>(null);

  const handleOpenEdit = (portfolio: Portfolio) => {
    setCurrentPortfolio(portfolio);
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setCurrentPortfolio(null);
  };

  const handleSavePortfolio = () => {
    if (currentPortfolio) {
      setPortfolios(prev => prev.map(p => p.id === currentPortfolio.id ? currentPortfolio : p));
      onUpdatePortfolio?.(currentPortfolio.id, currentPortfolio);
      handleCloseDialog();
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Portfolio Management Hub
      </Typography>
      <TableContainer component={Paper} elevation={2}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Portfolio Name</TableCell>
              <TableCell>Current Value</TableCell>
              <TableCell>Holdings</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {portfolios.map((portfolio) => (
              <TableRow key={portfolio.id}>
                <TableCell>{portfolio.name}</TableCell>
                <TableCell>${portfolio.currentValue.toLocaleString()}</TableCell>
                <TableCell>{portfolio.holdings.map(h => `${h.symbol} (${(h.percentage * 100).toFixed(0)}%)`).join(', ')}</TableCell>
                <TableCell>
                  <Button variant="outlined" size="small" onClick={() => handleOpenEdit(portfolio)}>Edit</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {currentPortfolio && (
        <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="sm">
          <DialogTitle>Edit Portfolio: {currentPortfolio.name}</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              margin="dense"
              label="Portfolio Name"
              type="text"
              fullWidth
              variant="standard"
              value={currentPortfolio.name}
              onChange={(e) => setCurrentPortfolio({ ...currentPortfolio, name: e.target.value })}
              sx={{ mb: 2 }}
            />
            {/* For a real app, holdings editing would be more complex */}
            <TextField
              margin="dense"
              label="Current Value"
              type="number"
              fullWidth
              variant="standard"
              value={currentPortfolio.currentValue}
              onChange={(e) => setCurrentPortfolio({ ...currentPortfolio, currentValue: Number(e.target.value) })}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDialog}>Cancel</Button>
            <Button onClick={handleSavePortfolio}>Save</Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
};

export default PortfolioManagementHub;


