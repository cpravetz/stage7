import React, { useState } from 'react';
import { Box, Typography, Paper, Select, MenuItem, FormControl, InputLabel, List, ListItem, ListItemText, Button, Grid } from '@mui/material/index.js';

interface GenreSpecificWorkshopProps {
  onSelectGenre: (genre: string) => void;
  onAnalyzeGenre: (genre: string) => void;
}

const genres = ['Pop', 'Rock', 'Hip-Hop', 'Jazz', 'Classical', 'Country', 'R&B', 'Electronic', 'Folk', 'Metal'];

const genreCharacteristics: Record<string, string[]> = {
  Pop: ['Catchy hooks', 'Relatable themes', 'Pentatonic melodies', 'Standard verse-chorus', 'Common chord progressions'],
  Rock: ['Guitar-driven', 'Rebellion themes', 'Power chords', 'Extended solos', 'Social commentary'],
  'Hip-Hop': ['Wordplay', 'Storytelling', 'Groove-oriented', 'Sample-based', 'Flow emphasis'],
  Jazz: ['Improvisation', 'Complex harmonies', 'Syncopation', 'Walking bass', 'Standards and originals'],
  Classical: ['Complex structure', 'Orchestral arrangements', 'Form variations', 'Thematic development', 'Emotional depth'],
  Country: ['Storytelling', 'Acoustic guitars', 'Twang vocals', 'Life narratives', 'Regional themes'],
  'R&B': ['Smooth vocals', 'Soul themes', 'Groove emphasis', 'String arrangements', 'Emotional depth'],
  Electronic: ['Synthesizers', 'Beat emphasis', 'Digital processing', 'Repetitive structures', 'Innovative sounds'],
  Folk: ['Acoustic instruments', 'Social themes', 'Narrative lyrics', 'Traditional forms', 'Cultural roots'],
  Metal: ['Heavy distortion', 'Complex time signatures', 'Fast solos', 'Aggressive themes', 'Double bass drums'],
};

const GenreSpecificWorkshop: React.FC<GenreSpecificWorkshopProps> = ({
  onSelectGenre,
  onAnalyzeGenre
}) => {
  const [selectedGenre, setSelectedGenre] = useState<string>('Pop');

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Genre-Specific Workshop
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel id="genre-select-label">Select Genre</InputLabel>
              <Select
                labelId="genre-select-label"
                value={selectedGenre}
                label="Select Genre"
                onChange={(e) => setSelectedGenre(e.target.value as string)}
              >
                {genres.map((genre) => (
                  <MenuItem key={genre} value={genre}>
                    {genre}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="contained"
              onClick={() => onSelectGenre(selectedGenre)}
              fullWidth
              sx={{ mb: 2 }}
            >
              Write in {selectedGenre}
            </Button>
            <Button
              variant="outlined"
              onClick={() => onAnalyzeGenre(selectedGenre)}
              fullWidth
            >
              Analyze {selectedGenre}
            </Button>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              {selectedGenre} Characteristics
            </Typography>
            <List>
              {genreCharacteristics[selectedGenre]?.map((characteristic, idx) => (
                <ListItem key={idx}>
                  <ListItemText primary={characteristic} />
                </ListItem>
              ))}
            </List>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default GenreSpecificWorkshop;


