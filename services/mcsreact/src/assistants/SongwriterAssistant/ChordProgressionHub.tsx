import React, { useState } from 'react';
import { Box, Typography, Paper, TextField, Button, Grid, Chip, List, ListItem, ListItemText, IconButton } from '@mui/material/index.js';
import { Delete as DeleteIcon, CheckCircle as SelectIcon } from '@mui/icons-material';

interface ChordProgression {
  id: string;
  name: string;
  chords: string[];
  genre?: string;
}

interface ChordProgressionHubProps {
  progressions: ChordProgression[];
  onSelectChordProgression: (progression: ChordProgression) => void;
  onCreateProgression: (progression: ChordProgression) => void;
  onDeleteProgression: (progressionId: string) => void;
}

const ChordProgressionHub: React.FC<ChordProgressionHubProps> = ({
  progressions,
  onSelectChordProgression,
  onCreateProgression,
  onDeleteProgression
}) => {
  const [newProgression, setNewProgression] = useState<Omit<ChordProgression, 'id'>>({ name: '', chords: [], genre: '' });
  const [newChordInput, setNewChordInput] = useState('');

  const handleAddChordToProgression = () => {
    if (newChordInput.trim()) {
      setNewProgression({
        ...newProgression,
        chords: [...newProgression.chords, newChordInput.trim()]
      });
      setNewChordInput('');
    }
  };

  const handleRemoveChordFromProgression = (index: number) => {
    setNewProgression({
      ...newProgression,
      chords: newProgression.chords.filter((_, i) => i !== index)
    });
  };

  const handleCreateProgression = () => {
    if (newProgression.name && newProgression.chords.length > 0) {
      onCreateProgression({ ...newProgression, id: String(Date.now()) });
      setNewProgression({ name: '', chords: [], genre: '' });
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Chord Progression Hub
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Create New Progression
            </Typography>
            <TextField
              label="Progression Name"
              fullWidth
              value={newProgression.name}
              onChange={(e) => setNewProgression({ ...newProgression, name: e.target.value })}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Genre (Optional)"
              fullWidth
              value={newProgression.genre || ''}
              onChange={(e) => setNewProgression({ ...newProgression, genre: e.target.value })}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Chord (e.g., Cmaj7, G7, Am)"
              fullWidth
              value={newChordInput}
              onChange={(e) => setNewChordInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleAddChordToProgression();
                }
              }}
              sx={{ mb: 2 }}
            />
            <Button variant="outlined" onClick={handleAddChordToProgression} fullWidth sx={{ mb: 2 }}>
              Add Chord
            </Button>
            
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2, p: 1, border: '1px solid #e0e0e0', borderRadius: 1 }}>
              {newProgression.chords.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No chords added yet</Typography>
              ) : (
                newProgression.chords.map((chord, idx) => (
                  <Chip
                    key={idx}
                    label={chord}
                    onDelete={() => handleRemoveChordFromProgression(idx)}
                    color="primary"
                  />
                ))
              )}
            </Box>

            <Button
              variant="contained"
              onClick={handleCreateProgression}
              fullWidth
              disabled={!newProgression.name || newProgression.chords.length === 0}
            >
              Create Progression
            </Button>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Chord Progressions ({progressions.length})
            </Typography>
            <List sx={{ maxHeight: 400, overflowY: 'auto' }}>
              {progressions.map((progression) => (
                <ListItem
                  key={progression.id}
                  divider
                  secondaryAction={
                    <Box>
                      <IconButton
                        edge="end"
                        aria-label="select"
                        onClick={() => onSelectChordProgression(progression)}
                        sx={{ mr: 1 }}
                      >
                        <SelectIcon />
                      </IconButton>
                      <IconButton
                        edge="end"
                        aria-label="delete"
                        onClick={() => onDeleteProgression(progression.id)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                  }
                >
                  <ListItemText
                    primary={<Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>{progression.name}</Typography>}
                    secondary={`${progression.chords.join(' - ')}${progression.genre ? ` (${progression.genre})` : ''}`}
                  />
                </ListItem>
              ))}
              {progressions.length === 0 && (
                <ListItem>
                  <ListItemText primary="No chord progressions yet. Create one to get started!" />
                </ListItem>
              )}
            </List>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default ChordProgressionHub;


