import React, { useState } from 'react';
import { Box, Typography, Paper, TextField, Button, List, ListItem, ListItemText, Select, MenuItem, FormControl, InputLabel, Grid, Chip, IconButton } from '@mui/material/index.js';
import { Delete as DeleteIcon, CheckCircle as SelectIcon } from '@mui/icons-material';
import { SongStructure, LyricSection } from './types';

interface SongStructureCenterProps {
  structures: SongStructure[];
  onCreateStructure: (structure: SongStructure) => void;
  onSelectStructure: (structureId: string) => void;
  onDeleteStructure: (structureId: string) => void;
}

const SongStructureCenter: React.FC<SongStructureCenterProps> = ({
  structures,
  onCreateStructure,
  onSelectStructure,
  onDeleteStructure
}) => {
  const [newStructureName, setNewStructureName] = useState<string>('');
  const [selectedSections, setSelectedSections] = useState<LyricSection['type'][]>([]);
  const [sectionToAdd, setSectionToAdd] = useState<LyricSection['type']>('Verse');

  const sectionTypes: LyricSection['type'][] = ['Intro', 'Verse', 'Pre-Chorus', 'Chorus', 'Bridge', 'Outro'];

  const handleAddStructure = () => {
    if (newStructureName && selectedSections.length > 0) {
      onCreateStructure({ id: String(Date.now()), name: newStructureName, sections: selectedSections });
      setNewStructureName('');
      setSelectedSections([]);
    }
  };

  const handleSectionAdd = () => {
    if (!selectedSections.includes(sectionToAdd)) {
      setSelectedSections([...selectedSections, sectionToAdd]);
    }
  };

  const handleSectionRemove = (index: number) => {
    setSelectedSections(selectedSections.filter((_, i) => i !== index));
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Song Structure Center
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Create New Song Structure
            </Typography>
            <TextField
              label="Structure Name"
              fullWidth
              value={newStructureName}
              onChange={(e) => setNewStructureName(e.target.value)}
              sx={{ mb: 2 }}
            />
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel id="add-section-label">Section Type</InputLabel>
              <Select
                labelId="add-section-label"
                value={sectionToAdd}
                label="Section Type"
                onChange={(e) => setSectionToAdd(e.target.value as LyricSection['type'])}
              >
                {sectionTypes.map((type) => (
                  <MenuItem key={type} value={type}>
                    {type}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button variant="outlined" onClick={handleSectionAdd} fullWidth sx={{ mb: 2 }}>
              Add Section Type
            </Button>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2, p: 1, border: '1px solid #e0e0e0', borderRadius: 1 }}>
              {selectedSections.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No sections selected</Typography>
              ) : (
                selectedSections.map((section, idx) => (
                  <Chip
                    key={idx}
                    label={section}
                    onDelete={() => handleSectionRemove(idx)}
                    color="primary"
                  />
                ))
              )}
            </Box>

            <Button
              variant="contained"
              onClick={handleAddStructure}
              fullWidth
              disabled={!newStructureName || selectedSections.length === 0}
            >
              Create Structure
            </Button>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Song Structures ({structures.length})
            </Typography>
            <List sx={{ maxHeight: 400, overflowY: 'auto' }}>
              {structures.map((structure) => (
                <ListItem
                  key={structure.id}
                  divider
                  secondaryAction={
                    <Box>
                      <IconButton
                        edge="end"
                        aria-label="select"
                        onClick={() => onSelectStructure(structure.id)}
                        sx={{ mr: 1 }}
                      >
                        <SelectIcon />
                      </IconButton>
                      <IconButton
                        edge="end"
                        aria-label="delete"
                        onClick={() => onDeleteStructure(structure.id)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                  }
                >
                  <ListItemText
                    primary={<Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>{structure.name}</Typography>}
                    secondary={structure.sections.join(' → ')}
                  />
                </ListItem>
              ))}
              {structures.length === 0 && (
                <ListItem>
                  <ListItemText primary="No song structures yet. Create one to get started!" />
                </ListItem>
              )}
            </List>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default SongStructureCenter;


