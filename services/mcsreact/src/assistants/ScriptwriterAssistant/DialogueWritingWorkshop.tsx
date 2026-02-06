import React, { useState } from 'react';
import { Box, Typography, Paper, TextField, Button, List, ListItem, ListItemText, Select, MenuItem, FormControl, InputLabel, Grid, IconButton } from '@mui/material/index.js';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { Character } from './types';

interface Dialogue {
  id: string;
  characterId: string;
  characterName: string;
  text: string;
  action?: string;
}

interface DialogueWritingWorkshopProps {
  dialogues: Dialogue[];
  characters: Character[];
  onWriteDialogue: (dialogue: Dialogue) => void;
  onDeleteDialogue: (dialogueId: string) => void;
  onUpdateDialogue: (dialogueId: string, text: string) => void;
}

const DialogueWritingWorkshop: React.FC<DialogueWritingWorkshopProps> = ({
  dialogues,
  characters,
  onWriteDialogue,
  onDeleteDialogue,
  onUpdateDialogue
}) => {
  const [newDialogueLine, setNewDialogueLine] = useState<{ characterId: string; text: string; action?: string }>({ characterId: '', text: '' });
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleAddDialogue = () => {
    if (newDialogueLine.characterId && newDialogueLine.text && characters.length > 0) {
      const character = characters.find(c => c.id === newDialogueLine.characterId);
      if (character) {
        onWriteDialogue({
          id: String(Date.now()),
          characterId: newDialogueLine.characterId,
          characterName: character.name,
          text: newDialogueLine.text,
          action: newDialogueLine.action
        });
        setNewDialogueLine({ characterId: '', text: '' });
      }
    }
  };

  const handleStartEdit = (dialogue: Dialogue) => {
    setEditingId(dialogue.id);
    setNewDialogueLine({ characterId: dialogue.characterId, text: dialogue.text, action: dialogue.action });
  };

  const handleSaveEdit = (dialogueId: string) => {
    onUpdateDialogue(dialogueId, newDialogueLine.text);
    setEditingId(null);
    setNewDialogueLine({ characterId: '', text: '' });
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Dialogue Writing Workshop
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              {editingId ? 'Edit Dialogue' : 'Add New Dialogue'}
            </Typography>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel id="character-select-label">Character</InputLabel>
              <Select
                labelId="character-select-label"
                value={newDialogueLine.characterId}
                label="Character"
                onChange={(e) => setNewDialogueLine({ ...newDialogueLine, characterId: e.target.value as string })}
              >
                {characters.map((char) => (
                  <MenuItem key={char.id} value={char.id}>
                    {char.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Dialogue Line"
              fullWidth
              multiline
              rows={3}
              value={newDialogueLine.text}
              onChange={(e) => setNewDialogueLine({ ...newDialogueLine, text: e.target.value })}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Action (Optional)"
              fullWidth
              value={newDialogueLine.action || ''}
              onChange={(e) => setNewDialogueLine({ ...newDialogueLine, action: e.target.value })}
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
                  Save Dialogue
                </Button>
                <Button 
                  variant="outlined" 
                  onClick={() => {
                    setEditingId(null);
                    setNewDialogueLine({ characterId: '', text: '' });
                  }} 
                  fullWidth
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button 
                variant="contained" 
                onClick={handleAddDialogue} 
                fullWidth
                disabled={!newDialogueLine.characterId || !newDialogueLine.text}
              >
                Add Dialogue
              </Button>
            )}
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Script Preview ({dialogues.length})
            </Typography>
            <List>
              {dialogues.map((line) => (
                <ListItem
                  key={line.id}
                  divider
                  secondaryAction={
                    <Box>
                      <IconButton
                        edge="end"
                        aria-label="edit"
                        onClick={() => handleStartEdit(line)}
                        sx={{ mr: 1 }}
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        edge="end"
                        aria-label="delete"
                        onClick={() => onDeleteDialogue(line.id)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                  }
                >
                  <ListItemText
                    primary={`${line.characterName}:${line.action ? ` [${line.action}]` : ''}`}
                    secondary={line.text}
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

export default DialogueWritingWorkshop;


