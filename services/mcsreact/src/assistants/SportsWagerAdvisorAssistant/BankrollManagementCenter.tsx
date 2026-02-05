import React, { useState } from 'react';
import { Box, Typography, Paper, TextField, Button, Grid, Alert } from '@mui/material/index.js';

interface BankrollManagementCenterProps {
  onUpdateBankroll: (amount: number) => void;
  onSetUnits: (unitSize: number) => void;
}

const BankrollManagementCenter: React.FC<BankrollManagementCenterProps> = ({
  onUpdateBankroll,
  onSetUnits
}) => {
  const [currentBankroll, setCurrentBankroll] = useState<number>(1000);
  const [depositAmount, setDepositAmount] = useState<number>(0);
  const [withdrawAmount, setWithdrawAmount] = useState<number>(0);
  const [unitSize, setUnitSize] = useState<number>(50);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleDeposit = () => {
    if (depositAmount > 0) {
      const newBankroll = currentBankroll + depositAmount;
      setCurrentBankroll(newBankroll);
      onUpdateBankroll(newBankroll);
      setMessage({ type: 'success', text: `Successfully deposited $${depositAmount}.` });
      setDepositAmount(0);
    } else {
      setMessage({ type: 'error', text: 'Deposit amount must be greater than zero.' });
    }
  };

  const handleWithdraw = () => {
    if (withdrawAmount > 0 && withdrawAmount <= currentBankroll) {
      const newBankroll = currentBankroll - withdrawAmount;
      setCurrentBankroll(newBankroll);
      onUpdateBankroll(newBankroll);
      setMessage({ type: 'success', text: `Successfully withdrew $${withdrawAmount}.` });
      setWithdrawAmount(0);
    } else if (withdrawAmount > currentBankroll) {
      setMessage({ type: 'error', text: 'Withdrawal amount exceeds current bankroll.' });
    } else {
      setMessage({ type: 'error', text: 'Withdrawal amount must be greater than zero.' });
    }
  };

  const handleSetUnits = () => {
    if (unitSize > 0 && unitSize < currentBankroll) {
      onSetUnits(unitSize);
      setMessage({ type: 'success', text: `Betting unit size set to $${unitSize}.` });
    } else {
      setMessage({ type: 'error', text: 'Unit size must be positive and less than bankroll.' });
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Bankroll Management Center
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid xs={12} item>
            <Typography variant="h6" gutterBottom>
              Current Bankroll: <Typography component="span" variant="h6" color="primary">${currentBankroll.toFixed(2)}</Typography>
            </Typography>
            {message && (
              <Alert severity={message.type} sx={{ mb: 2 }}>
                {message.text}
              </Alert>
            )}
          </Grid>
          <Grid {...({ xs: 12, md: 4, item: true } as any)}>
            <TextField
              label="Deposit Amount"
              type="number"
              fullWidth
              value={depositAmount || ''}
              onChange={(e) => setDepositAmount(Number(e.target.value))}
              sx={{ mb: 2 }}
            />
            <Button variant="contained" onClick={handleDeposit} fullWidth>
              Deposit
            </Button>
          </Grid>
          <Grid {...({ xs: 12, md: 4, item: true } as any)}>
            <TextField
              label="Withdraw Amount"
              type="number"
              fullWidth
              value={withdrawAmount || ''}
              onChange={(e) => setWithdrawAmount(Number(e.target.value))}
              sx={{ mb: 2 }}
            />
            <Button variant="contained" color="secondary" onClick={handleWithdraw} fullWidth>
              Withdraw
            </Button>
          </Grid>
          <Grid {...({ xs: 12, md: 4, item: true } as any)}>
            <TextField
              label="Unit Size ($)"
              type="number"
              fullWidth
              value={unitSize || ''}
              onChange={(e) => setUnitSize(Number(e.target.value))}
              sx={{ mb: 2 }}
            />
            <Button variant="contained" onClick={handleSetUnits} fullWidth>
              Set Units
            </Button>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default BankrollManagementCenter;



