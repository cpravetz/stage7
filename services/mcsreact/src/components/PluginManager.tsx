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
  SelectChangeEvent,
  TextField
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
  GitHub as GitHubIcon,
  Code as CodeIcon,
  ArrowBack as ArrowBackIcon
} from '@mui/icons-material';
import AddIcon from '@mui/icons-material/Add';
import { API_BASE_URL } from '../config';
import { SecurityClient } from '../SecurityClient';
import { useNavigate } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';

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

interface PluginManagerProps {
  onPluginSelect?: (plugin: Plugin) => void;
}

const PluginManager: React.FC<PluginManagerProps> = ({ onPluginSelect }) => {
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
  const [openToolDialog, setOpenToolDialog] = useState(false);
  const [toolDialogMode, setToolDialogMode] = useState<'add' | 'edit'>('add');
  const [toolForm, setToolForm] = useState<any>({
    id: '',
    verb: '',
    version: '',
    description: '',
    actionMappings: [{ actionVerb: '', path: '', method: '' }],
  });

  const navigate = useNavigate();

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

  // Use SecurityClient for authenticated API calls
  const securityClient = SecurityClient.getInstance(API_BASE_URL);
  
  // Always pass repository as a query param
  const fetchPlugins = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await securityClient.getApi().get(`/plugins`, {
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
      const securityClient = SecurityClient.getInstance(API_BASE_URL);
      await securityClient.getApi().delete(`/plugins/${pluginToDelete.id}`, {
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

  // Add/edit plugin (OpenAPI/MCP) - always pass repository param
  const handleAddOrEditPlugin = async (plugin: Plugin, isEdit: boolean) => {
    try {
      setLoading(true);
      const securityClient = SecurityClient.getInstance(API_BASE_URL);
      if (isEdit) {
        await securityClient.getApi().put(`/plugins/${plugin.id}`, plugin, {
          params: { repository: selectedRepository }
        });
      } else {
        await securityClient.getApi().post(`/plugins`, plugin, {
          params: { repository: selectedRepository }
        });
      }
      await fetchPlugins();
      setLoading(false);
    } catch (error) {
      console.error('Failed to save plugin:', error);
      setError('Failed to save plugin. Please try again later.');
      setLoading(false);
    }
  };

  // Get plugin manifest
  const fetchPluginManifest = async (pluginId: string) => {
    try {
      setLoading(true);
      const securityClient = SecurityClient.getInstance(API_BASE_URL);
      const response = await securityClient.getApi().get(`/plugins/${pluginId}`, {
        params: { repository: selectedRepository }
      });
      setLoading(false);
      return response.data.plugin;
    } catch (error) {
      setLoading(false);
      setError('Failed to fetch plugin manifest.');
      return null;
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

  const handleOpenAddToolDialog = () => {
    setToolDialogMode('add');
    setToolForm({
      id: '',
      verb: '',
      version: '',
      description: '',
      actionMappings: [{ actionVerb: '', path: '', method: '' }],
    });
    setOpenToolDialog(true);
  };

  const handleOpenEditToolDialog = (plugin: Plugin) => {
    setToolDialogMode('edit');
    setToolForm({ ...plugin });
    setOpenToolDialog(true);
  };

  const handleToolFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setToolForm({ ...toolForm, [e.target.name]: e.target.value });
  };

  const handleToolActionMappingChange = (idx: number, field: string, value: string) => {
    const newMappings = [...toolForm.actionMappings];
    newMappings[idx][field] = value;
    setToolForm({ ...toolForm, actionMappings: newMappings });
  };

  const handleAddActionMapping = () => {
    setToolForm({ ...toolForm, actionMappings: [...toolForm.actionMappings, { actionVerb: '', path: '', method: '' }] });
  };

  const handleRemoveActionMapping = (idx: number) => {
    const newMappings = toolForm.actionMappings.filter((_: any, i: number) => i !== idx);
    setToolForm({ ...toolForm, actionMappings: newMappings });
  };

  const handleToolDialogSave = async () => {
    // Compose the tool object for OpenAPI/MCP
    const tool = { ...toolForm };
    await handleAddOrEditPlugin(tool, toolDialogMode === 'edit');
    setOpenToolDialog(false);
  };

  // Only show Git if a non-GitHub git repo is configured and enabled
  const repoOptions = [
    { value: 'local', label: 'Local' },
    { value: 'mongo', label: 'MongoDB' },
    { value: 'github', label: 'GitHub' },
    { value: 'openapi', label: 'OpenAPI Tools' },
    { value: 'mcp', label: 'MCP Tools' },
  ];
  // TODO: Dynamically add 'git' if a non-GitHub git repo is configured

  return (
    <Box sx={{ width: '100%' }}>
      <AppBar position="static" color="primary" elevation={1} sx={{ mb: 2 }}>
        <Toolbar>
          <Button
            color="inherit"
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/')}
            sx={{ mr: 2 }}
          >
            Back to Home
          </Button>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Plugin Manager
          </Typography>
        </Toolbar>
      </AppBar>
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
              {repoOptions.map(opt => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Box>
            {(selectedRepository === 'openapi' || selectedRepository === 'mcp') && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleOpenAddToolDialog}
                sx={{ mr: 2 }}
              >
                Add {selectedRepository === 'openapi' ? 'OpenAPI Tool' : 'MCP Tool'}
              </Button>
            )}
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={fetchPlugins}
              disabled={loading}
            >
              Refresh
            </Button>
          </Box>
        </Box>

        {/* Info panels for each repo type */}
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
        {selectedRepository === 'openapi' && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              OpenAPI Tools
            </Typography>
            <Divider sx={{ my: 2 }} />
          </Box>
        )}
        {selectedRepository === 'mcp' && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              MCP Tools
            </Typography>
            <Divider sx={{ my: 2 }} />
          </Box>
        )}

        {/* Plugin list or empty message */}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        ) : plugins.length === 0 ? (
          <Alert severity="info">
            No plugins found in the {repoOptions.find(opt => opt.value === selectedRepository)?.label} repository.
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

      {/* Add/Edit Tool Dialog */}
      <Dialog open={openToolDialog} onClose={() => setOpenToolDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{toolDialogMode === 'add' ? `Add ${selectedRepository === 'openapi' ? 'OpenAPI Tool' : 'MCP Tool'}` : `Edit Tool`}</DialogTitle>
        <DialogContent>
          <TextField
            margin="dense"
            label="ID"
            name="id"
            value={toolForm.id}
            onChange={handleToolFormChange}
            fullWidth
            required
          />
          <TextField
            margin="dense"
            label="Verb"
            name="verb"
            value={toolForm.verb}
            onChange={handleToolFormChange}
            fullWidth
            required
          />
          <TextField
            margin="dense"
            label="Version"
            name="version"
            value={toolForm.version}
            onChange={handleToolFormChange}
            fullWidth
          />
          <TextField
            margin="dense"
            label="Description"
            name="description"
            value={toolForm.description}
            onChange={handleToolFormChange}
            fullWidth
            multiline
            minRows={2}
          />
          <Typography variant="subtitle1" sx={{ mt: 2 }}>Action Mappings</Typography>
          {toolForm.actionMappings.map((mapping: any, idx: number) => (
            <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <TextField
                label="Action Verb"
                value={mapping.actionVerb}
                onChange={e => handleToolActionMappingChange(idx, 'actionVerb', e.target.value)}
                size="small"
              />
              <TextField
                label="Path"
                value={mapping.path}
                onChange={e => handleToolActionMappingChange(idx, 'path', e.target.value)}
                size="small"
              />
              <TextField
                label="Method"
                value={mapping.method}
                onChange={e => handleToolActionMappingChange(idx, 'method', e.target.value)}
                size="small"
              />
              <Button color="error" onClick={() => handleRemoveActionMapping(idx)}>Remove</Button>
            </Box>
          ))}
          <Button onClick={handleAddActionMapping} sx={{ mt: 1 }}>Add Action Mapping</Button>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenToolDialog(false)}>Cancel</Button>
          <Button onClick={handleToolDialogSave} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PluginManager;
