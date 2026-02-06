import React, { useState } from 'react';
import { Box, Typography, Paper, Button, Slider, FormControl, InputLabel, Select, MenuItem, Grid, OutlinedInput, Chip, IconButton, List, ListItem, ListItemText } from '@mui/material/index.js';
import DeleteIcon from '@mui/icons-material/Delete';

export interface ProductionTechnique {
  id: string;
  technique: string;
  category: 'Mixing' | 'Mastering' | 'Effect' | 'Arrangement';
  description: string;
}

interface MusicProductionCenterProps {
  techniques: ProductionTechnique[];
  onApplyProduction: (technique: ProductionTechnique) => void;
  onExploreProduction: (category: string) => void;
}

const productionTechniques: ProductionTechnique[] = [
  { id: '1', technique: 'EQ Shaping', category: 'Mixing', description: 'Enhance frequency response' },
  { id: '2', technique: 'Compression', category: 'Mixing', description: 'Control dynamic range' },
  { id: '3', technique: 'Reverb', category: 'Effect', description: 'Add spaciousness' },
  { id: '4', technique: 'Delay', category: 'Effect', description: 'Create rhythmic echoes' },
  { id: '5', technique: 'Normalization', category: 'Mastering', description: 'Optimize loudness levels' },
  { id: '6', technique: 'Orchestration', category: 'Arrangement', description: 'Arrange instrumentation' },
];

const categories = ['Mixing', 'Mastering', 'Effect', 'Arrangement'];
const keys = ['C Major', 'G Major', 'D Major', 'A Major', 'E Major', 'B Major', 'F# Major', 'C# Major', 'F Major', 'Bb Major', 'Eb Major', 'Ab Major'];
const availableInstruments = ['Vocals', 'Guitar', 'Bass', 'Drums', 'Piano', 'Strings', 'Synth', 'Synth-Pad', 'Strings-Section'];

const MusicProductionCenter: React.FC<MusicProductionCenterProps> = ({
  techniques = [],
  onApplyProduction,
  onExploreProduction
}) => {
  const [tempo, setTempo] = useState<number>(120);
  const [key, setKey] = useState<string>('C Major');
  const [instrumentation, setInstrumentation] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('Mixing');

  const handleInstrumentationChange = (event: any) => {
    setInstrumentation(event.target.value as string[]);
  };

  const handleExploreTechnique = (category: string) => {
    onExploreProduction(category);
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Music Production Center
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Global Song Settings
            </Typography>
            <Box sx={{ mb: 3 }}>
              <Typography gutterBottom>Tempo: {tempo} BPM</Typography>
              <Slider
                value={tempo}
                onChange={(e, newValue) => setTempo(newValue as number)}
                aria-labelledby="tempo-slider"
                valueLabelDisplay="auto"
                min={60}
                max={200}
              />
            </Box>
            <FormControl fullWidth sx={{ mb: 3 }}>
              <InputLabel id="key-select-label">Key</InputLabel>
              <Select
                labelId="key-select-label"
                value={key}
                label="Key"
                onChange={(e) => setKey(e.target.value as string)}
              >
                {keys.map((k) => (
                  <MenuItem key={k} value={k}>
                    {k}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth sx={{ mb: 3 }}>
              <InputLabel id="instrumentation-select-label">Select Instruments</InputLabel>
              <Select
                labelId="instrumentation-select-label"
                multiple
                value={instrumentation}
                onChange={handleInstrumentationChange}
                input={<OutlinedInput label="Select Instruments" />}
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {(selected as string[]).map((value) => (
                      <Chip key={value} label={value} />
                    ))}
                  </Box>
                )}
              >
                {availableInstruments.map((inst) => (
                  <MenuItem key={inst} value={inst}>
                    {inst}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Production Techniques
            </Typography>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel id="category-select-label">Category</InputLabel>
              <Select
                labelId="category-select-label"
                value={selectedCategory}
                label="Category"
                onChange={(e) => setSelectedCategory(e.target.value as string)}
              >
                {categories.map((cat) => (
                  <MenuItem key={cat} value={cat}>
                    {cat}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="contained"
              onClick={() => handleExploreTechnique(selectedCategory)}
              fullWidth
            >
              Explore {selectedCategory}
            </Button>
          </Grid>
          <Grid xs={12} item>
            <Typography variant="h6" gutterBottom>
              Applied Techniques
            </Typography>
            <List>
              {techniques.map((tech) => (
                <ListItem
                  key={tech.id}
                  secondaryAction={
                    <IconButton
                      edge="end"
                      aria-label="delete"
                      onClick={() => onApplyProduction(tech)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  }
                >
                  <ListItemText
                    primary={tech.technique}
                    secondary={`${tech.category} - ${tech.description}`}
                  />
                </ListItem>
              ))}
              {techniques.length === 0 && (
                <ListItem>
                  <ListItemText primary="No techniques applied yet" />
                </ListItem>
              )}
            </List>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default MusicProductionCenter;


