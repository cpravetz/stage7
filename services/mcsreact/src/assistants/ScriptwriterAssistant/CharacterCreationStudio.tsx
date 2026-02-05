import React, { useState } from 'react';
import { Box, Typography, Paper, TextField, Button, List, ListItem, ListItemText, Grid, IconButton } from '@mui/material/index.js';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { Character } from './types';

interface CharacterCreationStudioProps {
  characters: Character[];
  onCreateCharacter: (character: Character) => void;
  onDeleteCharacter: (characterId: string) => void;
  onUpdateCharacter: (characterId: string, updates: Partial<Character>) => void;
}

const CharacterCreationStudio: React.FC<CharacterCreationStudioProps> = ({
  characters,
  onCreateCharacter,
  onDeleteCharacter,
  onUpdateCharacter
}) => {
  const [newCharacter, setNewCharacter] = useState<Omit<Character, 'id'>>({ name: '', description: '', role: '' });
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleAddCharacter = () => {
    if (newCharacter.name && newCharacter.description) {
      onCreateCharacter({ ...newCharacter, id: String(Date.now()) });
      setNewCharacter({ name: '', description: '', role: '' });
    }
  };

  const handleStartEdit = (character: Character) => {
    setEditingId(character.id);
    setNewCharacter({ name: character.name, description: character.description, role: character.role });
  };

  const handleSaveEdit = (characterId: string) => {
    onUpdateCharacter(characterId, newCharacter);
    setEditingId(null);
    setNewCharacter({ name: '', description: '', role: '' });
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Character Creation Studio
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              {editingId ? 'Edit Character' : 'Create New Character'}
            </Typography>
            <TextField
              label="Name"
              fullWidth
              value={newCharacter.name}
              onChange={(e) => setNewCharacter({ ...newCharacter, name: e.target.value })}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Description"
              fullWidth
              multiline
              rows={3}
              value={newCharacter.description}
              onChange={(e) => setNewCharacter({ ...newCharacter, description: e.target.value })}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Role"
              fullWidth
              value={newCharacter.role}
              onChange={(e) => setNewCharacter({ ...newCharacter, role: e.target.value })}
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
                  Save Character
                </Button>
                <Button 
                  variant="outlined" 
                  onClick={() => {
                    setEditingId(null);
                    setNewCharacter({ name: '', description: '', role: '' });
                  }} 
                  fullWidth
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button variant="contained" onClick={handleAddCharacter} fullWidth>
                Add Character
              </Button>
            )}
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Characters ({characters.length})
            </Typography>
            <List>
              {characters.map((character) => (
                <ListItem
                  key={character.id}
                  secondaryAction={
                    <Box>
                      <IconButton
                        edge="end"
                        aria-label="edit"
                        onClick={() => handleStartEdit(character)}
                        sx={{ mr: 1 }}
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        edge="end"
                        aria-label="delete"
                        onClick={() => onDeleteCharacter(character.id)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                  }
                >
                  <ListItemText
                    primary={character.name}
                    secondary={`${character.role ? character.role + ' - ' : ''}${character.description}`}
                  />
                </ListItem>
              ))}
            </List>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default CharacterCreationStudio;


