import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
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
  Edit as EditIcon,
  GitHub as GitHubIcon,
  Add as AddIcon,
  Code as CodeIcon,
  CloudUpload as CloudUploadIcon
} from '@mui/icons-material';
import axios from 'axios';

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

  const checkGitHubConfiguration = async () => {
    try {
      const response = await axios.get('/api/github/config');
      setGithubConfig({
        token: response.data.token ? '********' : '',
        username: response.data.username || '',
        repository: response.data.repository || '',
        configured: response.data.configured || false
      });
    } catch (error) {
      console.error('Failed to fetch GitHub configuration:', error);
      setGithubConfig({
        token: '',
        username: '',
        repository: '',
        configured: false
      });
    }
  };

  const fetchPlugins = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await axios.get(`/api/plugins?repository=${selectedRepository}`);
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
      await axios.delete(`/api/plugins/${pluginToDelete.id}?repository=${selectedRepository}`);
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

  const handleSaveGitHubConfig = async (event: React.FormEvent) => {
    event.preventDefault();
    
    try {
      setLoading(true);
      setError(null);

      await axios.post('/api/github/config', {
        token: githubConfig.token,
        username: githubConfig.username,
        repository: githubConfig.repository
      });

      setGithubConfig({
        ...githubConfig,
        configured: true
      });
      
      setLoading(false);
      fetchPlugins();
    } catch (error) {
      console.error('Failed to save GitHub configuration:', error);
      setError('Failed to save GitHub configuration. Please try again later.');
      setLoading(false);
    }
  };

  const handleGitHubConfigChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setGithubConfig({
      ...githubConfig,
      [name]: value
    });
  };

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
              GitHub Configuration
            </Typography>
            <Box component="form" onSubmit={handleSaveGitHubConfig}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth
                    label="GitHub Username"
                    name="username"
                    value={githubConfig.username}
                    onChange={handleGitHubConfigChange}
                    margin="normal"
                    required
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth
                    label="GitHub Token"
                    name="token"
                    type="password"
                    value={githubConfig.token}
                    onChange={handleGitHubConfigChange}
                    margin="normal"
                    required
                    placeholder={githubConfig.configured ? '********' : ''}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth
                    label="Repository (owner/name)"
                    name="repository"
                    value={githubConfig.repository}
                    onChange={handleGitHubConfigChange}
                    margin="normal"
                    required
                  />
                </Grid>
                <Grid item xs={12}>
                  <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    startIcon={<CloudUploadIcon />}
                    disabled={loading}
                  >
                    Save Configuration
                  </Button>
                </Grid>
              </Grid>
            </Box>
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
