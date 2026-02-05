import React from 'react';
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Button } from '@mui/material/index.js';
import { Game } from './types';

interface OddsAnalysisHubProps {
  games: Game[];
  onAnalyzeOdds: (gameId: string) => void;
}

const OddsAnalysisHub: React.FC<OddsAnalysisHubProps> = ({
  games = [],
  onAnalyzeOdds
}) => {
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Odds Analysis Hub
      </Typography>
      <TableContainer component={Paper} elevation={2}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Sport</TableCell>
              <TableCell>Matchup</TableCell>
              <TableCell>Date</TableCell>
              <TableCell colSpan={3} align="center">Odds</TableCell>
              <TableCell align="center">Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {games.map((game) => (
              <TableRow key={game.id}>
                <TableCell>{game.sport}</TableCell>
                <TableCell>{game.teams.join(' vs ')}</TableCell>
                <TableCell>{game.date}</TableCell>
                {Object.entries(game.odds).map(([outcome, odd]) => (
                  <TableCell key={outcome}>{outcome}: {odd.toFixed(2)}</TableCell>
                ))}
                <TableCell align="center">
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => onAnalyzeOdds(game.id)}
                  >
                    Analyze
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {games.length === 0 && (
        <Paper elevation={2} sx={{ p: 2, mt: 2 }}>
          <Typography>No games available for odds analysis.</Typography>
        </Paper>
      )}
    </Box>
  );
};

export default OddsAnalysisHub;;

