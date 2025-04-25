import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Divider,
  Chip,
  Grid,
  Card,
  CardContent,
  CardActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
  GitHub as GitHubIcon,
  Code as CodeIcon
} from '@mui/icons-material';
import axios from 'axios';
import { API_BASE_URL } from '../config';

interface Plugin {
  id: string;
  verb: string;
  version: string;
  description: string;
  repository: {
    type: string;
    url: string;
  };
}

interface GitHubPluginManagerProps {
  onPluginSelect?: (plugin: Plugin) => void;
}

const GitHubPluginManager: React.FC<GitHubPluginManagerProps> = ({ onPluginSelect }) => {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRepository, setSelectedRepository] = useState<string>('github');
  const [openDeleteDialog, setOpenDeleteDialog] = useState<boolean>(false);
  const [pluginToDelete, setPluginToDelete] = useState<Plugin | null>(null);
  const [githubConfig, setGithubConfig] = useState({
    token: '',
    username: '',
    repository: '',
    configured: false
  });

  useEffect(() => {
    fetchPlugins();
    checkGitHubConfiguration();
  }, [selectedRepository]);

  // We don't need to check GitHub configuration directly from the frontend
  // The CapabilitiesManager will handle this internally
  const checkGitHubConfiguration = async () => {
    try {
      setLoading(true);
      setError(null);

      // Just fetch the plugins to see if they're available
      await fetchPlugins();

      // If we get here, we can assume the configuration is working
      setGithubConfig({
        token: '********', // We don't need to show the actual token
        username: 'Managed by CapabilitiesManager',
        repository: 'Managed by CapabilitiesManager',
        configured: true
      });

      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch plugins:', error);
      setGithubConfig({
        token: '',
        username: '',
        repository: '',
        configured: false
      });
      setLoading(false);
    }
  };

  const fetchPlugins = async () => {
    try {
      setLoading(true);
      setError(null);

      // Use the PostOffice service to get plugins from the CapabilitiesManager
      const response = await axios.get(`${API_BASE_URL}/plugins`, {
        params: { repository: selectedRepository }
      });

      setPlugins(response.data.plugins || []);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch plugins:', error);
      setError('Failed to fetch plugins. Please try again later.');
      setLoading(false);
    }
  };

  const handleRepositoryChange = (event: SelectChangeEvent) => {
    setSelectedRepository(event.target.value);
  };

  const handleDeletePlugin = async () => {
    if (!pluginToDelete) return;

    try {
      setLoading(true);

      // Use the PostOffice service to delete the plugin from the CapabilitiesManager
      await axios.delete(`${API_BASE_URL}/plugins/${pluginToDelete.id}`, {
        params: { repository: selectedRepository }
      });

      setPlugins(plugins.filter(plugin => plugin.id !== pluginToDelete.id));
      setOpenDeleteDialog(false);
      setPluginToDelete(null);
      setLoading(false);
    } catch (error) {
      console.error('Failed to delete plugin:', error);
      setError('Failed to delete plugin. Please try again later.');
      setLoading(false);
    }
  };

  const handleOpenDeleteDialog = (plugin: Plugin) => {
    setPluginToDelete(plugin);
    setOpenDeleteDialog(true);
  };

  const handleCloseDeleteDialog = () => {
    setOpenDeleteDialog(false);
    setPluginToDelete(null);
  };

  // We no longer need GitHub configuration functions since the CapabilitiesManager handles this internally

  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="h4" gutterBottom>
        Plugin Manager
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel id="repository-select-label">Repository</InputLabel>
            <Select
              labelId="repository-select-label"
              id="repository-select"
              value={selectedRepository}
              label="Repository"
              onChange={handleRepositoryChange}
            >
              <MenuItem value="local">Local</MenuItem>
              <MenuItem value="mongo">MongoDB</MenuItem>
              <MenuItem value="github">GitHub</MenuItem>
              <MenuItem value="git">Git</MenuItem>
            </Select>
          </FormControl>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchPlugins}
            disabled={loading}
          >
            Refresh
          </Button>
        </Box>

        {selectedRepository === 'github' && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              GitHub Plugin Repository
            </Typography>
            <Alert severity="info" sx={{ mb: 2 }}>
              GitHub plugin repository is configured in the CapabilitiesManager service.
              Use environment variables ENABLE_GITHUB, GITHUB_TOKEN, GITHUB_USERNAME, and GIT_REPOSITORY_URL
              to configure the GitHub plugin repository.
            </Alert>
            <Divider sx={{ my: 2 }} />
          </Box>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        ) : (
          <>
            {plugins.length === 0 ? (
              <Alert severity="info">
                No plugins found in the {selectedRepository} repository.
              </Alert>
            ) : (
              <Grid container spacing={2}>
                {plugins.map((plugin) => (
                  <Grid item xs={12} sm={6} md={4} key={plugin.id}>
                    <Card>
                      <CardContent>
                        <Typography variant="h6" component="div">
                          {plugin.verb}
                        </Typography>
                        <Typography color="text.secondary" gutterBottom>
                          ID: {plugin.id}
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 1.5 }}>
                          {plugin.description || 'No description available'}
                        </Typography>
                        <Chip
                          icon={<GitHubIcon />}
                          label={`v${plugin.version || '1.0.0'}`}
                          size="small"
                          color="primary"
                          variant="outlined"
                        />
                      </CardContent>
                      <CardActions>
                        <Button
                          size="small"
                          startIcon={<CodeIcon />}
                          onClick={() => onPluginSelect && onPluginSelect(plugin)}
                        >
                          View
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          startIcon={<DeleteIcon />}
                          onClick={() => handleOpenDeleteDialog(plugin)}
                        >
                          Delete
                        </Button>
                        {plugin.repository.url && (
                          <Button
                            size="small"
                            href={plugin.repository.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            startIcon={<GitHubIcon />}
                          >
                            GitHub
                          </Button>
                        )}
                      </CardActions>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}
          </>
        )}
      </Paper>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={openDeleteDialog}
        onClose={handleCloseDeleteDialog}
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
      >
        <DialogTitle id="delete-dialog-title">Delete Plugin</DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-dialog-description">
            Are you sure you want to delete the plugin "{pluginToDelete?.verb}"? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteDialog} color="primary">
            Cancel
          </Button>
          <Button onClick={handleDeletePlugin} color="error" autoFocus>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default GitHubPluginManager;
