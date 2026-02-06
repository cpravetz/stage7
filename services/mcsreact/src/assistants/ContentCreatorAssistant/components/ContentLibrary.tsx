import React from 'react';
import { Box, Typography, Paper, List, ListItem, ListItemText, Chip, ListItemSecondaryAction, IconButton } from '@mui/material/index.js';
import { Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { ContentPiece } from '../types';

interface ContentLibraryProps {
  contentPieces: ContentPiece[];
  onEditContent: (content: ContentPiece) => void;
  onDeleteContent: (id: string) => void; // New prop
}

const ContentLibrary: React.FC<ContentLibraryProps> = ({ contentPieces, onEditContent, onDeleteContent }) => {
  const getStatusColor = (status: ContentPiece['status']) => {
    switch (status) {
      case 'Draft': return 'default';
      case 'Pending Review': return 'warning';
      case 'Published': return 'success';
      default: return 'default';
    }
  };

  const handleDelete = (id: string) => {
    onDeleteContent(id); // Use the prop
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Content Library
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <List>
          {contentPieces.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
              No content pieces available.
            </Typography>
          ) : (
            contentPieces.map((content) => (
              <ListItem key={content.id} divider>
                <ListItemText
                  primary={content.title}
                  secondary={
                    <React.Fragment>
                      <Typography component="span" variant="body2" color="text.primary">
                        Platform: {content.platform}
                      </Typography>
                      <br />
                      Status: <Chip label={content.status} size="small" color={getStatusColor(content.status)} />
                    </React.Fragment>
                  }
                />
              <ListItemSecondaryAction>
                <IconButton edge="end" aria-label="edit" onClick={() => onEditContent(content)}>
                  <EditIcon />
                </IconButton>
                <IconButton edge="end" aria-label="delete" onClick={() => handleDelete(content.id)}>
                  <DeleteIcon />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          )))}
        </List>
      </Paper>
    </Box>
  );
};

export default ContentLibrary;


