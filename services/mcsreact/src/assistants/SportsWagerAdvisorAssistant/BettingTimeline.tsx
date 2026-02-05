import React from 'react';
import { Box, Typography, Paper, List, ListItem, ListItemText, ListItemIcon } from '@mui/material/index.js';
import {Event as EventIcon} from '@mui/icons-material';
import { Wager } from './types';

const mockWagers: Wager[] = [
  { id: 't1', gameId: 'game1', selection: 'Real Madrid Win', amount: 50, potentialPayout: 105, status: 'won' },
  { id: 't2', gameId: 'game2', selection: 'LA Lakers Win', amount: 30, potentialPayout: 54, status: 'lost' },
  { id: 't3', gameId: 'game3', selection: 'Djokovic Win', amount: 70, potentialPayout: 105, status: 'pending' },
  { id: 't4', gameId: 'game4', selection: 'Team X vs Team Y', amount: 20, potentialPayout: 40, status: 'pending' },
];

const BettingTimeline = () => {
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Betting Timeline
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <List>
          {mockWagers.map((wager) => (
            <ListItem key={wager.id}>
              <ListItemIcon>
                <EventIcon />
              </ListItemIcon>
              <ListItemText
                primary={`Wager on ${wager.selection}`}
                secondary={`Amount: $${wager.amount} | Status: ${wager.status} | Game ID: ${wager.gameId}`}
              />
            </ListItem>
          ))}
        </List>
      </Paper>
    </Box>
  );
};

export default BettingTimeline;


