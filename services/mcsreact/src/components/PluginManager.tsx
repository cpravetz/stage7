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
  TextField,
  IconButton
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
  GitHub as GitHubIcon,
  Code as CodeIcon,
  ArrowBack as ArrowBackIcon,
  Add as AddIcon,
  Check as CheckIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { Theme } from '@mui/material/styles';
import { API_BASE_URL } from '../config';
import { SecurityClient } from '../SecurityClient';
import { useNavigate } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import PluginDefinitionForm from './PluginDefinitionForm';
import ToolSourceForm from './ToolSourceForm';
import { PluginManifest, DefinitionManifest, DefinitionType } from '@cktmcs/shared';

interface Plugin extends PluginManifest {
  definitionType?: DefinitionType;
  toolDefinition?: any;
  primaryActionVerb?: string;
}

interface ToolSource {
    id: string;
    type: 'openapi' | 'git' | 'marketplace';
    url: string;
    last_scanned_at?: string;
}

interface PendingTool {
    id: string;
    source_id: string;
    manifest_url: string;
    manifest_json: any;
    status: 'pending' | 'approved' | 'rejected';
    policy_config?: any;
}

interface PluginManagerProps {
  onPluginSelect?: (plugin: Plugin) => void;
}

const PluginManager: React.FC<PluginManagerProps> = ({ onPluginSelect }) => {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [toolSources, setToolSources] = useState<ToolSource[]>([]);
  const [pendingTools, setPendingTools] = useState<PendingTool[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRepository, setSelectedRepository] = useState<string>('mongo');
  const [openDeleteDialog, setOpenDeleteDialog] = useState<boolean>(false);
  const [openPluginForm, setOpenPluginForm] = useState<boolean>(false);
  const [openToolSourceForm, setOpenToolSourceForm] = useState<boolean>(false);
  const [editingPlugin, setEditingPlugin] = useState<Plugin | null>(null);
  const [pluginToDelete, setPluginToDelete] = useState<Plugin | null>(null);
  const [sourceToDelete, setSourceToDelete] = useState<ToolSource | null>(null);
  const [selectedPendingTool, setSelectedPendingTool] = useState<PendingTool | null>(null);
  const [policyConfig, setPolicyConfig] = useState<any>({});
  const [githubConfig, setGithubConfig] = useState({ configured: false });

  const navigate = useNavigate();

  useEffect(() => {
    fetchPlugins();
  }, [selectedRepository]);

  const securityClient = SecurityClient.getInstance(API_BASE_URL);
  
  const fetchPlugins = async () => {
    try {
      setLoading(true);
      setError(null);
      if (selectedRepository === 'external') {
        await Promise.all([
            fetchToolSources(),
            fetchPendingTools()
        ]);
      } else {
        const response = await securityClient.getApi().get(`/plugins`, {
            params: { repository: selectedRepository }
        });
        setPlugins(response.data.plugins || []);
      }

      if (selectedRepository === 'github') {
        const response = await securityClient.getApi().get(`/plugins`, {
            params: { repository: selectedRepository }
        });
        setGithubConfig({ configured: response.data.plugins && response.data.plugins.length > 0 });
      }

      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      setError('Failed to fetch data. Please try again later.');
      setLoading(false);

      if (selectedRepository === 'github') {
        setGithubConfig({ configured: false });
      }
    }
  };

  const fetchToolSources = async () => {
      try {
          const response = await securityClient.getApi().get(`/tools/sources`);
          setToolSources(response.data);
      } catch (error) {
          console.error('Error fetching tool sources:', error);
          throw error;
      }
  };

  const fetchPendingTools = async () => {
      try {
          const response = await securityClient.getApi().get(`/tools/pending`);
          setPendingTools(response.data);
      } catch (error) {
          console.error('Error fetching pending tools:', error);
          throw error;
      }
  };

  const handleRepositoryChange = (event: SelectChangeEvent) => {
    setSelectedRepository(event.target.value);
  };

  const handleDeletePlugin = async () => {
    if (!pluginToDelete) return;
    try {
      setLoading(true);
      await securityClient.getApi().delete(`/plugins/${pluginToDelete.id}`, {
        params: { repository: selectedRepository }
      });
      fetchPlugins();
      setOpenDeleteDialog(false);
      setPluginToDelete(null);
    } catch (error) {
      console.error('Failed to delete plugin:', error);
      setError('Failed to delete plugin. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSource = async () => {
    if (!sourceToDelete) return;
    try {
        setLoading(true);
        await securityClient.getApi().delete(`/tools/sources/${sourceToDelete.id}`);
        fetchPlugins();
        setOpenDeleteDialog(false);
        setSourceToDelete(null);
    } catch (error) {
        console.error('Failed to delete tool source:', error);
        setError('Failed to delete tool source. Please try again later.');
    } finally {
        setLoading(false);
    }
  };

  const handleOpenDeleteDialog = (item: Plugin | ToolSource) => {
    if ('verb' in item) {
        setPluginToDelete(item);
    } else {
        setSourceToDelete(item);
    }
    setOpenDeleteDialog(true);
  };

  const handleCloseDeleteDialog = () => {
    setOpenDeleteDialog(false);
    setPluginToDelete(null);
    setSourceToDelete(null);
  };

  const handleOpenAddPluginForm = () => {
    setEditingPlugin(null);
    setOpenPluginForm(true);
  };

  const handleOpenEditPluginForm = (plugin: Plugin) => {
    setEditingPlugin(plugin);
    setOpenPluginForm(true);
  };

  const handleClosePluginForm = () => {
    setOpenPluginForm(false);
    setEditingPlugin(null);
  };

  const handleOpenToolSourceForm = () => {
    setOpenToolSourceForm(true);
  };

  const handleCloseToolSourceForm = () => {
    setOpenToolSourceForm(false);
  };

  const handleSubmitPluginForm = async (pluginData: PluginManifest | DefinitionManifest) => {
    setLoading(true);
    setError(null);
    try {
      const isEdit = !!editingPlugin;
      if (isEdit) {
        await securityClient.getApi().put(`/plugins/${pluginData.id}`, pluginData, {
          params: { repository: selectedRepository }
        });
      } else {
        await securityClient.getApi().post(`/plugins`, pluginData, {
          params: { repository: selectedRepository }
        });
      }
      await fetchPlugins();
      handleClosePluginForm();
    } catch (err) {
      console.error('Failed to save plugin:', err);
      setError(`Failed to save plugin: ${(err as any).response?.data?.message || (err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitToolSourceForm = async (sourceData: { id: string; type: 'openapi' | 'git' | 'marketplace'; url: string }) => {
    setLoading(true);
    setError(null);
    try {
        await securityClient.getApi().post(`/tools/sources`, sourceData);
        await fetchPlugins();
        handleCloseToolSourceForm();
    } catch (err) {
        console.error('Failed to save tool source:', err);
        setError(`Failed to save tool source: ${(err as any).response?.data?.message || (err as Error).message}`);
    } finally {
        setLoading(false);
    }
  };

  const handleApproveTool = async () => {
      if (selectedPendingTool) {
          setLoading(true);
          setError(null);
          try {
              await securityClient.getApi().post(`/tools/pending/${selectedPendingTool.id}/approve`, {
                  policy_config: policyConfig,
              });
              setSelectedPendingTool(null);
              setPolicyConfig({});
              await fetchPendingTools();
          } catch (error) {
              setError('Failed to approve tool.');
              console.error('Error approving tool:', error);
          } finally {
              setLoading(false);
          }
      }
  };

  const handleRejectTool = async (id: string) => {
      setLoading(true);
      setError(null);
      try {
          await securityClient.getApi().post(`/tools/pending/${id}/reject`);
          await fetchPendingTools();
      } catch (error) {
          setError('Failed to reject tool.');
          console.error('Error rejecting tool:', error);
      } finally {
          setLoading(false);
      }
  };

  const repoOptions = [
    { value: 'local', label: 'Local' },
    { value: 'mongo', label: 'MongoDB' },
    { value: 'github', label: 'GitHub' },
    { value: 'external', label: 'External Tools' }, 
  ];
  
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
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={fetchPlugins}
              disabled={loading}
              sx={{ mr: 1 }}
            >
              Refresh
            </Button>
            {(selectedRepository === 'mongo' || selectedRepository === 'external') && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={selectedRepository === 'external' ? handleOpenToolSourceForm : handleOpenAddPluginForm}
                disabled={loading}
              >
                Add New
              </Button>
            )}
          </Box>
        </Box>

        {selectedRepository === 'github' && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              GitHub Plugin Repository
            </Typography>
            {githubConfig.configured ? (
              <Alert severity="success" sx={{ mb: 2 }}>
                GitHub plugin repository is configured and accessible.
              </Alert>
            ) : (
              <Alert severity="info" sx={{ mb: 2 }}>
                GitHub plugin repository is not configured or accessible. Please ensure the CapabilitiesManager service has the necessary environment variables (ENABLE_GITHUB, GITHUB_TOKEN, GITHUB_USERNAME, GIT_REPOSITORY_URL) set correctly.
              </Alert>
            )}
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
        ) : selectedRepository === 'external' ? (
            <Box>
                <Typography variant="h6" gutterBottom>Tool Sources</Typography>
                <Grid container spacing={2}>
                    {toolSources.map((source) => (
                        <Grid item xs={12} sm={6} md={4} key={source.id}>
                            <Card>
                                <CardContent>
                                    <Typography variant="h6">{source.id}</Typography>
                                    <Typography color="text.secondary">{source.type}</Typography>
                                    <Typography variant="body2">{source.url}</Typography>
                                </CardContent>
                                <CardActions>
                                    <Button size="small" onClick={() => { /* Placeholder for future actions */ }}>View</Button>
                                    <Button size="small" color="error" onClick={() => handleOpenDeleteDialog(source)}>Delete</Button>
                                </CardActions>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
                <Divider sx={{ my: 3 }} />
                <Typography variant="h6" gutterBottom>Airlock - Pending Tools</Typography>
                <Grid container spacing={2}>
                    {pendingTools.map((tool) => (
                        <Grid item xs={12} sm={6} md={4} key={tool.id}>
                            <Card>
                                <CardContent>
                                    <Typography variant="h6">{tool.id}</Typography>
                                    <Typography color="text.secondary">{tool.source_id}</Typography>
                                    <Chip label={tool.status} size="small" />
                                </CardContent>
                                <CardActions>
                                    <Button size="small" startIcon={<CheckIcon />} onClick={() => setSelectedPendingTool(tool)}>Review</Button>
                                    <Button size="small" color="error" startIcon={<CloseIcon />} onClick={() => handleRejectTool(tool.id)}>Reject</Button>
                                </CardActions>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            </Box>
        ) : (plugins.length === 0 ? (
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
                      startIcon={<CodeIcon />} // Reusing CodeIcon for Edit
                      onClick={() => handleOpenEditPluginForm(plugin)}
                    >
                      Edit
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
        ))}
      </Paper>

      <ToolSourceForm 
        open={openToolSourceForm} 
        onClose={handleCloseToolSourceForm} 
        onSubmit={handleSubmitToolSourceForm} 
      />

      <Dialog open={openPluginForm} onClose={handleClosePluginForm} maxWidth="md" fullWidth>
        <DialogTitle>{editingPlugin ? 'Edit Plugin' : 'Add New Plugin'}</DialogTitle>
        <DialogContent dividers>
          <PluginDefinitionForm
            initialPlugin={editingPlugin || undefined}
            onSubmit={handleSubmitPluginForm}
            onCancel={handleClosePluginForm}
            loading={loading}
            error={error}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedPendingTool} onClose={() => setSelectedPendingTool(null)} maxWidth="md" fullWidth>
          <DialogTitle>
              Review Tool: {selectedPendingTool?.id}
              <IconButton
                  aria-label="close"
                  onClick={() => setSelectedPendingTool(null)}
                  sx={{
                      position: 'absolute',
                      right: 8,
                      top: 8,
                      color: (theme: Theme) => theme.palette.grey[500],
                  }}
              >
                  <CloseIcon />
              </IconButton>
          </DialogTitle>
          <DialogContent dividers>
              <Typography variant="h6" gutterBottom>Manifest JSON</Typography>
              <Paper variant="outlined" sx={{ p: 2, mb: 2, backgroundColor: '#f5f5f5' }}>
                  <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {JSON.stringify(selectedPendingTool?.manifest_json, null, 2)}
                  </pre>
              </Paper>

              <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>Policy Configuration</Typography>
              <TextField
                  label="Policy Configuration (JSON)"
                  multiline
                  rows={10}
                  fullWidth
                  variant="outlined"
                  value={JSON.stringify(policyConfig, null, 2)}
                  onChange={(e) => {
                      try {
                          setPolicyConfig(JSON.parse(e.target.value));
                      } catch (err) {
                          console.error('Invalid JSON for policy config', err);
                      }
                  }}
                  sx={{ mb: 2 }}
              />
          </DialogContent>
          <DialogActions>
              <Button onClick={() => setSelectedPendingTool(null)} color="secondary">
                  Cancel
              </Button>
              <Button onClick={handleApproveTool} variant="contained" startIcon={<CheckIcon />}>
                  Approve
              </Button>
          </DialogActions>
      </Dialog>

      <Dialog
        open={openDeleteDialog}
        onClose={handleCloseDeleteDialog}
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
      >
        <DialogTitle id="delete-dialog-title">Delete {sourceToDelete ? 'Source' : 'Plugin'}</DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-dialog-description">
            Are you sure you want to delete the {sourceToDelete ? `source "${sourceToDelete?.id}"` : `plugin "${pluginToDelete?.verb}"`}? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteDialog} color="primary">
            Cancel
          </Button>
          <Button onClick={sourceToDelete ? handleDeleteSource : handleDeletePlugin} color="error" autoFocus>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PluginManager;
