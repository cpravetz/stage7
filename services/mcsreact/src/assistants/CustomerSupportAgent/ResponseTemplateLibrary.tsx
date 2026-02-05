import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, TextField, Button, List, ListItem, ListItemText, InputAdornment, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, ListItemSecondaryAction, CircularProgress, Alert } from '@mui/material';
import { Search as SearchIcon, Edit as EditIcon, Delete as  DeleteIcon, Add as AddIcon } from '@mui/icons-material';
import { ResponseTemplate } from './types'; // Import from shared types
import { CustomerSupportAssistantClient } from './CustomerSupportAssistantClient'; // Import the client

interface ResponseTemplateLibraryProps {
  conversationId: string | null;
  client: CustomerSupportAssistantClient;
  setError: (message: string | null) => void;
}

const ResponseTemplateLibrary: React.FC<ResponseTemplateLibraryProps> = ({ conversationId, client, setError }) => {
  const [allTemplates, setAllTemplates] = useState<ResponseTemplate[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<ResponseTemplate[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [openDialog, setOpenDialog] = useState<boolean>(false);
  const [currentTemplate, setCurrentTemplate] = useState<ResponseTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTemplates = async () => {
    if (!conversationId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await client.getResponseTemplates(conversationId);
      setAllTemplates(data);
      setFilteredTemplates(data); // Initially show all templates
    } catch (err) {
      console.error('Error fetching response templates:', err);
      setError(`Error fetching response templates: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [conversationId, client]); // Re-fetch when conversationId or client changes

  const handleSearch = async () => {
    if (!conversationId) return;
    setIsLoading(true);
    setError(null);
    try {
      if (searchTerm.trim() === '') {
        setFilteredTemplates(allTemplates); // If search term is empty, show all
      } else {
        const data = await client.searchResponseTemplates(conversationId, searchTerm);
        setFilteredTemplates(data);
      }
    } catch (err) {
      console.error('Error searching response templates:', err);
      setError(`Error searching response templates: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (template: ResponseTemplate) => {
    setCurrentTemplate(template);
    setOpenDialog(true);
  };

  const handleDelete = async (id: string) => {
    if (!conversationId) return;
    if (window.confirm('Are you sure you want to delete this template?')) {
      setError(null);
      try {
        await client.deleteResponseTemplate(conversationId, id);
        fetchTemplates(); // Re-fetch to update the list
      } catch (err) {
        console.error('Error deleting template:', err);
        setError(`Error deleting template: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  const handleSaveEdit = async () => {
    if (!currentTemplate || !conversationId) return;
    setError(null);
    try {
      if (currentTemplate.id.startsWith('new-')) { // Check if it's a new template
        await client.createResponseTemplate(conversationId, currentTemplate.name, currentTemplate.category, currentTemplate.content);
      } else {
        await client.updateResponseTemplate(conversationId, currentTemplate.id, currentTemplate.name, currentTemplate.category, currentTemplate.content);
      }
      setOpenDialog(false);
      setCurrentTemplate(null);
      fetchTemplates(); // Re-fetch to update the list
    } catch (err) {
      console.error('Error saving template:', err);
      setError(`Error saving template: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleAddNewTemplate = () => {
    setCurrentTemplate({
      id: `new-${Date.now()}`, // Temporary ID for new template
      name: '',
      category: '',
      content: '',
    });
    setOpenDialog(true);
  };

  if (isLoading) {
    return (
      <Box sx={{ mt: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ ml: 2 }}>Loading Templates...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Response Template Library
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <TextField
          label="Search Templates"
          fullWidth
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              handleSearch();
            }
          }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton onClick={handleSearch} disabled={isLoading}>
                  <SearchIcon />
                </IconButton>
              </InputAdornment>
            ),
          }}
          sx={{ mb: 2 }}
        />
        <Button variant="contained" onClick={handleSearch} fullWidth sx={{ mb: 2 }} disabled={isLoading}>
          Search
        </Button>
        <Button variant="outlined" startIcon={<AddIcon />} onClick={handleAddNewTemplate} fullWidth sx={{ mb: 2 }}>
          Add New Template
        </Button>

        {filteredTemplates.length > 0 ? (
          <List>
            {filteredTemplates.map((template) => (
              <ListItem key={template.id} divider>
                <ListItemText
                  primary={template.name}
                  secondary={template.content.substring(0, 100) + '...'}
                />
                <ListItemSecondaryAction>
                  <IconButton edge="end" aria-label="edit" onClick={() => handleEdit(template)}>
                    <EditIcon />
                  </IconButton>
                  <IconButton edge="end" aria-label="delete" onClick={() => handleDelete(template.id)}>
                    <DeleteIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            No templates found.
          </Typography>
        )}
      </Paper>

      {currentTemplate && (
        <Dialog open={openDialog} onClose={() => setOpenDialog(false)} fullWidth maxWidth="md">
          <DialogTitle>{currentTemplate.id.startsWith('new-') ? 'Add New Template' : `Edit Template: ${currentTemplate.name}`}</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              margin="dense"
              label="Template Name"
              type="text"
              fullWidth
              variant="standard"
              value={currentTemplate.name}
              onChange={(e) => setCurrentTemplate({ ...currentTemplate, name: e.target.value })}
              sx={{ mb: 2 }}
            />
            <TextField
              margin="dense"
              label="Category"
              type="text"
              fullWidth
              variant="standard"
              value={currentTemplate.category}
              onChange={(e) => setCurrentTemplate({ ...currentTemplate, category: e.target.value })}
              sx={{ mb: 2 }}
            />
            <TextField
              margin="dense"
              label="Content"
              type="text"
              fullWidth
              multiline
              rows={8}
              variant="outlined"
              value={currentTemplate.content}
              onChange={(e) => setCurrentTemplate({ ...currentTemplate, content: e.target.value })}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit}>Save</Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
};

export default ResponseTemplateLibrary;


