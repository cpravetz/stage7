import React, { useState } from 'react';
import { Box, Typography, Paper, TextField, Button, Grid, IconButton, List, ListItem, ListItemText, Chip } from '@mui/material/index.js';
import { Delete as DeleteIcon, PlayArrow as PlayIcon, Add as AddIcon, MusicNote as MusicNoteIcon } from '@mui/icons-material';

interface MelodyIdea {
  id: string;
  name: string;
  description: string;
  key?: string;
}

interface MelodyCompositionStudioProps {
  melodies: MelodyIdea[];
  onCreateMelody: (melody: MelodyIdea) => void;
  onDeleteMelody: (melodyId: string) => void;
  onPlayMelody: (melodyId: string) => void;
}

const MelodyCompositionStudio: React.FC<MelodyCompositionStudioProps> = ({
  melodies,
  onCreateMelody,
  onDeleteMelody,
  onPlayMelody
}) => {
  const [newMelody, setNewMelody] = useState<Omit<MelodyIdea, 'id'>>({ name: '', description: '', key: '' });
  const [melody, setMelody] = useState<Array<{id: string, note: string, duration: string}>>([]);

  const handleAddMelody = () => {
    if (newMelody.name && newMelody.description) {
      onCreateMelody({ ...newMelody, id: String(Date.now()) });
      setNewMelody({ name: '', description: '', key: '' });
    }
  };

  const [newNote, setNewNote] = useState({ note: 'C4', duration: '1' });

  const handleAddNote = () => {
    if (newNote.note && newNote.duration) {
      const noteToAdd = {
        id: String(Date.now()),
        note: newNote.note,
        duration: newNote.duration
      };
      setMelody([...melody, noteToAdd]);
      // Reset to default values
      setNewNote({ note: 'C4', duration: '1' });
    }
  };

  const handleRemoveNote = (noteId: string) => {
    setMelody(melody.filter(note => note.id !== noteId));
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Melody Composition Studio
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Create New Melody
            </Typography>
            <TextField
              label="Melody Name"
              fullWidth
              value={newMelody.name}
              onChange={(e) => setNewMelody({ ...newMelody, name: e.target.value })}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Description"
              fullWidth
              multiline
              rows={3}
              value={newMelody.description}
              onChange={(e) => setNewMelody({ ...newMelody, description: e.target.value })}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Key (e.g., C Major, G Minor)"
              fullWidth
              value={newMelody.key || ''}
              onChange={(e) => setNewMelody({ ...newMelody, key: e.target.value })}
              sx={{ mb: 2 }}
            />
            <Button
              variant="contained"
              onClick={handleAddMelody}
              fullWidth
              disabled={!newMelody.name || !newMelody.description}
            >
              Create Melody
            </Button>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Melody Ideas ({melodies.length})
            </Typography>
            <List sx={{ maxHeight: 400, overflowY: 'auto' }}>
              {melodies.map((melody) => (
                <ListItem
                  key={melody.id}
                  divider
                  secondaryAction={
                    <Box>
                      <IconButton
                        edge="end"
                        aria-label="play"
                        onClick={() => onPlayMelody(melody.id)}
                        sx={{ mr: 1 }}
                      >
                        <PlayIcon />
                      </IconButton>
                      <IconButton
                        edge="end"
                        aria-label="delete"
                        onClick={() => onDeleteMelody(melody.id)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                  }
                >
                  <ListItemText
                    primary={<Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>{melody.name}</Typography>}
                    secondary={`${melody.description}${melody.key ? ` - ${melody.key}` : ''}`}
                  />
                </ListItem>
              ))}
            </List>
            <Box sx={{ mt: 2, mb: 2, p: 2, border: '1px dashed #ccc', borderRadius: 1 }}>
              <Typography variant="subtitle2" gutterBottom>
                Add New Note
              </Typography>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={5}>
                  <TextField
                    label="Note (e.g., C4, G#3)"
                    fullWidth
                    size="small"
                    value={newNote.note}
                    onChange={(e) => setNewNote({ ...newNote, note: e.target.value })}
                  />
                </Grid>
                <Grid item xs={5}>
                  <TextField
                    label="Duration (beats)"
                    fullWidth
                    size="small"
                    type="number"
                    value={newNote.duration}
                    onChange={(e) => setNewNote({ ...newNote, duration: e.target.value })}
                  />
                </Grid>
                <Grid item xs={2}>
                  <Button
                    variant="contained"
                    onClick={handleAddNote}
                    fullWidth
                    startIcon={<AddIcon />}
                    disabled={!newNote.note || !newNote.duration}
                  >
                    Add
                  </Button>
                </Grid>
              </Grid>
            </Box>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Current Melody Sketch
            </Typography>
            <Box sx={{ border: '1px solid #ccc', p: 2, minHeight: 150, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {melody.map((note) => (
                <Chip
                  key={note.id}
                  icon={<MusicNoteIcon />}
                  label={`${note.note} (${note.duration})`}
                  onDelete={() => handleRemoveNote(note.id)}
                  color="primary"
                  variant="outlined"
                />
              ))}
            </Box>
            <Button variant="contained" sx={{ mt: 2 }} fullWidth>
              Play Melody (Placeholder)
            </Button>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default MelodyCompositionStudio;


