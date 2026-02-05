import React from 'react';
import { Box, Typography, Paper, List, ListItem, ListItemText, Chip } from '@mui/material/index.js';
import { InvestmentStrategy } from './types';

interface InvestmentStrategyCenterProps {
  onSelectStrategy?: (strategy: InvestmentStrategy) => void;
  onCreateCustomStrategy?: (strategy: InvestmentStrategy) => void;
}

const mockStrategies: InvestmentStrategy[] = [
  { id: 'is1', name: 'Long-term Growth', description: 'Focus on growth stocks with high potential over several years.', riskProfile: 'Aggressive', expectedReturn: '10-15% annually' },
  { id: 'is2', name: 'Balanced Portfolio', description: 'Mix of stocks and bonds for moderate growth and stability.', riskProfile: 'Moderate', expectedReturn: '5-8% annually' },
  { id: 'is3', name: 'Income Generation', description: 'Primarily investing in dividend-paying stocks and high-yield bonds.', riskProfile: 'Conservative', expectedReturn: '3-5% annually' },
];

const InvestmentStrategyCenter: React.FC<InvestmentStrategyCenterProps> = ({ onSelectStrategy, onCreateCustomStrategy }) => {
  const getRiskColor = (risk: InvestmentStrategy['riskProfile']) => {
    switch (risk) {
      case 'Conservative': return 'success';
      case 'Moderate': return 'warning';
      case 'Aggressive': return 'error';
      default: return 'default';
    }
  };

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Investment Strategy Center
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <List>
          {mockStrategies.map((strategy) => (
            <ListItem key={strategy.id} divider>
              <ListItemText
                primary={strategy.name}
                secondary={
                  <React.Fragment>
                    <Typography component="span" variant="body2" color="text.primary">
                      {strategy.description}
                    </Typography>
                    <br />
                    {'Expected Return: '}
                    <Chip label={strategy.expectedReturn} size="small" />
                  </React.Fragment>
                }
              />
              <Chip label={strategy.riskProfile} color={getRiskColor(strategy.riskProfile)} size="small" sx={{ ml: 2 }} />
            </ListItem>
          ))}
        </List>
      </Paper>
    </Box>
  );
};

export default InvestmentStrategyCenter;


