import React, { useState } from 'react';
import { Box, Typography, Paper, List, ListItem, ListItemText, Chip, Button, TextField, FormControl, InputLabel, Select, MenuItem, Grid, IconButton } from '@mui/material/index.js';
import { Delete as DeleteIcon, CheckCircle as SelectIcon } from '@mui/icons-material';
import { Strategy } from './types';

interface BettingStrategyCenterProps {
  strategies: Strategy[];
  onSelectStrategy: (strategy: Strategy) => void;
  onCreateStrategy: (name: string, description: string) => void;
}

const BettingStrategyCenter: React.FC<BettingStrategyCenterProps> = ({
  strategies = [],
  onSelectStrategy,
  onCreateStrategy
}) => {
  const [newStrategyName, setNewStrategyName] = useState('');
  const [newStrategyDesc, setNewStrategyDesc] = useState('');

  const getRiskColor = (risk: Strategy['riskLevel']) => {
    switch (risk) {
      case 'Low': return 'success';
      case 'Medium': return 'warning';
      case 'High': return 'error';
      default: return 'default';
    }
  };

  const handleCreateStrategy = () => {
    if (newStrategyName && newStrategyDesc) {
      onCreateStrategy(newStrategyName, newStrategyDesc);
      setNewStrategyName('');
      setNewStrategyDesc('');
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Betting Strategy Center
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Create New Strategy
            </Typography>
            <TextField
              label="Strategy Name"
              fullWidth
              value={newStrategyName}
              onChange={(e) => setNewStrategyName(e.target.value)}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Description"
              fullWidth
              multiline
              rows={4}
              value={newStrategyDesc}
              onChange={(e) => setNewStrategyDesc(e.target.value)}
              sx={{ mb: 2 }}
            />
            <Button
              variant="contained"
              onClick={handleCreateStrategy}
              fullWidth
              disabled={!newStrategyName || !newStrategyDesc}
            >
              Create Strategy
            </Button>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Available Strategies ({strategies.length})
            </Typography>
            <List sx={{ maxHeight: 400, overflowY: 'auto' }}>
              {strategies.map((strategy) => (
                <ListItem
                  key={strategy.id}
                  divider
                  secondaryAction={
                    <Box>
                      <IconButton
                        edge="end"
                        aria-label="select"
                        onClick={() => onSelectStrategy(strategy)}
                        sx={{ mr: 1 }}
                      >
                        <SelectIcon />
                      </IconButton>
                    </Box>
                  }
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                          {strategy.name}
                        </Typography>
                        <Chip label={strategy.riskLevel} color={getRiskColor(strategy.riskLevel)} size="small" />
                      </Box>
                    }
                    secondary={
                      <React.Fragment>
                        <Typography component="span" variant="body2" color="text.primary">
                          {strategy.description}
                        </Typography>
                        <br />
                        {'Expected ROI: '}
                        <Chip label={strategy.expectedROI} size="small" />
                      </React.Fragment>
                    }
                  />
                </ListItem>
              ))}
              {strategies.length === 0 && (
                <ListItem>
                  <ListItemText primary="No strategies available. Create one to get started!" />
                </ListItem>
              )}
            </List>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default BettingStrategyCenter;


