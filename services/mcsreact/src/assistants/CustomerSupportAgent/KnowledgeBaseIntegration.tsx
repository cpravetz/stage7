import React, { useState } from 'react';
import { Box, Typography, Paper, TextField, Button, List, ListItem, ListItemText, InputAdornment, IconButton, CircularProgress, Alert } from '@mui/material/index.js';
import { Search as SearchIcon } from '@mui/icons-material';
import { Article } from '../types'; // Import Article from shared types
import { CustomerSupportAssistantClient } from './CustomerSupportAssistantClient'; // Import the client

interface KnowledgeBaseIntegrationProps {
  conversationId: string | null;
  client: CustomerSupportAssistantClient;
  setError: (message: string | null) => void;
}

const KnowledgeBaseIntegration: React.FC<KnowledgeBaseIntegrationProps> = ({ conversationId, client, setError }) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [searchResults, setSearchResults] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchInitiated, setSearchInitiated] = useState(false); // To show "No results" only after a search

  const handleSearch = async () => {
    if (!conversationId) {
      setError('Conversation not started. Cannot search knowledge base.');
      return;
    }
    if (searchTerm.trim() === '') {
      setSearchResults([]);
      setSearchInitiated(false);
      return;
    }
    setIsLoading(true);
    setSearchInitiated(true);
    setError(null);
    try {
      const data = await client.searchKnowledgeBase(conversationId, searchTerm);
      setSearchResults(data);
    } catch (err) {
      console.error('Error searching knowledge base:', err);
      setError(`Error searching knowledge base: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        Knowledge Base Integration
      </Typography>
      <Paper elevation={2} sx={{ p: 2 }}>
        <TextField
          label="Search Knowledge Base"
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
                  {isLoading ? <CircularProgress size={20} /> : <SearchIcon />}
                </IconButton>
              </InputAdornment>
            ),
          }}
          sx={{ mb: 2 }}
        />
        <Button variant="contained" onClick={handleSearch} fullWidth disabled={isLoading}>
          Search
        </Button>

        {setError && <Alert severity="error">{setError}</Alert>} {/* Display parent error if available */}

        {searchInitiated && isLoading && (
          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress />
          </Box>
        )}

        {searchInitiated && !isLoading && searchResults.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="h6" gutterBottom>
              Search Results
            </Typography>
            <List>
              {searchResults.map((article) => (
                <ListItem key={article.id} divider>
                  <ListItemText
                    primary={article.title}
                    secondary={article.content.substring(0, 100) + '...'} // Show a snippet
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        )}
        {searchInitiated && !isLoading && searchResults.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            No articles found matching "{searchTerm}".
          </Typography>
        )}
      </Paper>
    </Box>
  );
};

export default KnowledgeBaseIntegration;


