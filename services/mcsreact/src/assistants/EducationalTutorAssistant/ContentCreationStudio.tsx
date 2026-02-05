import React, { useState } from 'react';
import { Box, Typography, Paper, TextField, Button, List, ListItem, ListItemText, FormControl, InputLabel, Select, MenuItem, Grid } from '@mui/material/index.js';

interface EducationalContent {
  id: string;
  type: 'Question' | 'Explanation' | 'Example';
  topic: string;
  content: string;
}

const ContentCreationStudio = () => {
  const [contentPieces, setContentPieces] = useState<EducationalContent[]>([]);
  const [newContent, setNewContent] = useState<Omit<EducationalContent, 'id'>>({ type: 'Explanation', topic: '', content: '' });

  const contentTypes: EducationalContent['type'][] = ['Question', 'Explanation', 'Example'];

  const handleAddContent = () => {
    if (newContent.topic && newContent.content) {
      setContentPieces([...contentPieces, { ...newContent, id: String(contentPieces.length + 1) }]);
      setNewContent({ type: 'Explanation', topic: '', content: '' });
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Content Creation Studio
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={3}>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Create New Educational Content
            </Typography>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel id="content-type-label">Content Type</InputLabel>
              <Select
                labelId="content-type-label"
                value={newContent.type}
                label="Content Type"
                onChange={(e) => setNewContent({ ...newContent, type: e.target.value as EducationalContent['type'] })}
              >
                {contentTypes.map((type) => (
                  <MenuItem key={type} value={type}>
                    {type}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Topic"
              fullWidth
              value={newContent.topic}
              onChange={(e) => setNewContent({ ...newContent, topic: e.target.value })}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Content"
              fullWidth
              multiline
              rows={6}
              value={newContent.content}
              onChange={(e) => setNewContent({ ...newContent, content: e.target.value })}
              sx={{ mb: 2 }}
            />
            <Button variant="contained" onClick={handleAddContent} fullWidth>
              Add Content
            </Button>
          </Grid>
          <Grid {...({ xs: 12, md: 6, item: true } as any)}>
            <Typography variant="h6" gutterBottom>
              Created Content
            </Typography>
            <List>
              {contentPieces.map((item) => (
                <ListItem key={item.id} divider>
                  <ListItemText
                    primary={`${item.type}: ${item.topic}`}
                    secondary={item.content.substring(0, 100) + (item.content.length > 100 ? '...' : '')}
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

export default ContentCreationStudio;


