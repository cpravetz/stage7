import React, { useState } from 'react';
import { Box, Typography, Paper, TextField, Button, List, ListItem, ListItemText, Select, MenuItem, FormControl, InputLabel, Grid, IconButton } from '@mui/material/index.js';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { LyricSection } from './types';

interface LyricWritingCenterProps {
  lyrics: LyricSection[];
  onAddLyrics: (section: LyricSection) => void;
  onDeleteLyrics: (lyricId: string) => void;
  onUpdateLyrics: (lyricId: string, content: string) => void;
}

const LyricWritingCenter: React.FC<LyricWritingCenterProps> = ({
  lyrics,
  onAddLyrics,
  onDeleteLyrics,
  onUpdateLyrics
}) => {
  const [newLyricSection, setNewLyricSection] = useState<Omit<LyricSection, 'id'>>({ type: 'Verse', content: '' });
  const [editingId, setEditingId] = useState<string | null>(null);

  const sectionTypes: LyricSection['type'][] = ['Verse', 'Chorus', 'Bridge', 'Pre-Chorus', 'Outro', 'Intro'];

  const handleAddLyricSection = () => {
    if (newLyricSection.content) {
      onAddLyrics({ ...newLyricSection, id: String(Date.now()) });
      setNewLyricSection({ type: 'Verse', content: '' });
    }
  };

  const handleStartEdit = (lyric: LyricSection) => {
    setEditingId(lyric.id);
    setNewLyricSection({ type: lyric.type, content: lyric.content });
  };

  const handleSaveEdit = (lyricId: string) => {
    onUpdateLyrics(lyricId, newLyricSection.content);
    setEditingId(null);
    setNewLyricSection({ type: 'Verse', content: '' });
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Lyric Writing Center
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              {editingId ? 'Edit Lyric Section' : 'Add New Lyric Section'}
            </Typography>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel id="section-type-label">Section Type</InputLabel>
              <Select
                labelId="section-type-label"
                value={newLyricSection.type}
                label="Section Type"
                onChange={(e) => setNewLyricSection({ ...newLyricSection, type: e.target.value as LyricSection['type'] })}
              >
                {sectionTypes.map((type) => (
                  <MenuItem key={type} value={type}>
                    {type}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Content"
              fullWidth
              multiline
              rows={6}
              value={newLyricSection.content}
              onChange={(e) => setNewLyricSection({ ...newLyricSection, content: e.target.value })}
              sx={{ mb: 2 }}
            />
            {editingId ? (
              <>
                <Button 
                  variant="contained" 
                  onClick={() => handleSaveEdit(editingId)} 
                  fullWidth
                  sx={{ mb: 1 }}
                >
                  Save Lyrics
                </Button>
                <Button 
                  variant="outlined" 
                  onClick={() => {
                    setEditingId(null);
                    setNewLyricSection({ type: 'Verse', content: '' });
                  }} 
                  fullWidth
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button 
                variant="contained" 
                onClick={handleAddLyricSection} 
                fullWidth
                disabled={!newLyricSection.content}
              >
                Add Lyric Section
              </Button>
            )}
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Lyric Sections ({lyrics.length})
            </Typography>
            <List sx={{ maxHeight: 400, overflowY: 'auto' }}>
              {lyrics.map((lyric) => (
                <ListItem
                  key={lyric.id}
                  divider
                  secondaryAction={
                    <Box>
                      <IconButton
                        edge="end"
                        aria-label="edit"
                        onClick={() => handleStartEdit(lyric)}
                        sx={{ mr: 1 }}
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        edge="end"
                        aria-label="delete"
                        onClick={() => onDeleteLyrics(lyric.id)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                  }
                >
                  <ListItemText
                    primary={<Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>{lyric.type}</Typography>}
                    secondary={lyric.content}
                  />
                </ListItem>
              ))}
              {lyrics.length === 0 && (
                <ListItem>
                  <ListItemText primary="No lyric sections yet. Add one to get started!" />
                </ListItem>
              )}
            </List>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default LyricWritingCenter;


