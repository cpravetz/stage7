import React, { useState } from 'react';
import { Box, Typography, Paper, Grid, Button, CircularProgress, TextField } from '@mui/material/index.js';
import { Game } from './types';

interface LiveBettingConsoleProps {
  games: Game[];
  onPlaceBet: (gameId: string, selection: string, amount: number) => void;
}

const LiveBettingConsole: React.FC<LiveBettingConsoleProps> = ({
  games = [],
  onPlaceBet
}) => {
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<string>('');
  const [betAmount, setBetAmount] = useState<number>(0);
  const [confirmedBets, setConfirmedBets] = useState<Array<{ gameId: string; selection: string; amount: number }>>([]);

  const handlePlaceBet = () => {
    if (selectedGameId && selectedOutcome && betAmount > 0) {
      onPlaceBet(selectedGameId, selectedOutcome, betAmount);
      setConfirmedBets([...confirmedBets, { gameId: selectedGameId, selection: selectedOutcome, amount: betAmount }]);
      setSelectedGameId(null);
      setSelectedOutcome('');
      setBetAmount(0);
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Live Betting Console
      </Typography>
      
      {confirmedBets.length > 0 && (
        <Paper elevation={2} sx={{ p: 2, mb: 3, backgroundColor: '#e8f5e9' }}>
          <Typography variant="h6" color="success.main" gutterBottom>
            Recent Bets Placed: {confirmedBets.length}
          </Typography>
          {confirmedBets.map((bet, idx) => (
            <Typography key={idx} variant="body2">
              • {bet.selection} on Game {bet.gameId} for ${bet.amount.toFixed(2)}
            </Typography>
          ))}
        </Paper>
      )}

      <Grid container spacing={3}>
        {games.map((game) => (
          <Grid {...({ xs: 12, md: 6, key: game.id, item: true } as any)}>
            <Paper elevation={2} sx={{ p: 2 }}>
              <Typography variant="h6">{game.sport}: {game.teams.join(' vs ')}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{game.date}</Typography>
              <Grid container spacing={1} sx={{ mb: 2 }}>
                {Object.entries(game.odds).map(([outcome, odd]) => (
                  <Grid {...({ xs: 6, key: outcome, item: true } as any)}>
                    <Button
                      variant={selectedGameId === game.id && selectedOutcome === outcome ? 'contained' : 'outlined'}
                      fullWidth
                      onClick={() => {
                        setSelectedGameId(game.id);
                        setSelectedOutcome(outcome);
                      }}
                    >
                      {outcome} ({odd.toFixed(2)})
                    </Button>
                  </Grid>
                ))}
              </Grid>
              {selectedGameId === game.id && (
                <Box>
                  <TextField
                    label="Bet Amount ($)"
                    type="number"
                    fullWidth
                    value={betAmount || ''}
                    onChange={(e) => setBetAmount(Number(e.target.value))}
                    sx={{ mb: 1 }}
                  />
                  <Button
                    variant="contained"
                    color="success"
                    onClick={handlePlaceBet}
                    fullWidth
                    disabled={betAmount <= 0}
                  >
                    Place Bet
                  </Button>
                </Box>
              )}
            </Paper>
          </Grid>
        ))}
      </Grid>
      
      {games.length === 0 && (
        <Paper elevation={2} sx={{ p: 2 }}>
          <Typography>No live games available for betting.</Typography>
        </Paper>
      )}
    </Box>
  );
};

export default LiveBettingConsole;



