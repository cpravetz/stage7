import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
  Chip,
  Grid,
  Card,
  CardContent,
  CardHeader,
  Divider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  SelectChangeEvent,
  Button,
  AppBar,
  Toolbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Stack
} from '@mui/material/index.js';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { useWebSocket, useMission } from '../context/WebSocketContext';
import { API_BASE_URL } from '../config';
import { SecurityClient } from '../SecurityClient';

export enum LLMConversationType {
    TextToText = 'TextToText',
    TextToImage = 'TextToImage',
    TextToAudio = 'TextToAudio',
    TextToVideo = 'TextToVideo',
    AudioToText = 'AudioToText',
    ImageToText = 'ImageToText',
    ImageToImage = 'ImageToImage',
    ImageToAudio = 'ImageToAudio',
    ImageToVideo = 'ImageToVideo',
    VideoToText = 'VideoToText',
    VideoToImage = 'VideoToImage',
    VideoToAudio = 'VideoToAudio',
    VideoToVideo = 'VideoToVideo',
    TextToCode = 'TextToCode',
    CodeToText = 'CodeToText',
}

interface ModelPerformanceMetrics {
  usageCount?: number;
  successCount?: number;
  failureCount?: number;
  logicFailureCount?: number;
  successRate?: number;
  averageLatency?: number;
  averageTokenCount?: number;
  lastUsed?: string;
  consecutiveFailures?: number;
  lastFailureTime?: string | null;
  blacklistedUntil?: string | null;
  feedbackScores?: {
    relevance?: number;
    accuracy?: number;
    helpfulness?: number;
    creativity?: number;
    overall?: number;
  };
}

interface ModelRanking {
  modelName?: string;
  score?: number;
}

interface ModelConfiguration {
  id: string;
  name: string;
  provider: string;
  providerModelId: string;
  tokenLimit: number;
  costPer1kTokens: {
    input: number;
    output: number;
  };
  supportedConversationTypes: LLMConversationType[];
  status: 'active' | 'beta' | 'deprecated' | 'retired';
  deployedAt: string;
  retiredAt?: string;
  rolloutPercentage: number;
  providerCredentials: {
    keyVault: string;
    credentialName: string;
    validated: boolean;
    validatedAt?: string;
    validationError?: string;
  };
  availability: {
    status: 'available' | 'degraded' | 'unavailable' | 'unknown';
    checkedAt?: string;
    reason?: string;
    nextCheckAt?: string;
  };
  healthChecks: {
    endpoint: string;
    method: 'GET' | 'POST';
    timeout: number;
    expectedStatusCodes: number[];
    expectedResponseBody?: string;
    frequency: number;
  };
  sla?: {
    successRateMinimum: number;
    p99LatencyMs: number;
    availabilityPercentage: number;
  };
  metadata: {
    version: string;
    releaseNotes: string;
    knownLimitations: string[];
    optimizations: string[];
  };
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`model-performance-tabpanel-${index}`}
      aria-labelledby={`model-performance-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `model-performance-tab-${index}`,
    'aria-controls': `model-performance-tabpanel-${index}`,
  };
}

const ModelPerformanceDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { isConnected } = useWebSocket();
    const { activeMission, activeMissionId } = useMission();
  
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [performanceData, setPerformanceData] = useState<Record<string, ModelPerformanceMetrics>>({});
  const [rankings, setRankings] = useState<ModelRanking[]>([]);  // Initialize with empty array
  const [conversationType, setConversationType] = useState<LLMConversationType>(LLMConversationType.TextToText);
  const [rankingMetric, setRankingMetric] = useState<'successRate' | 'averageLatency' | 'overall'>('overall');
  const [modelConfigs, setModelConfigs] = useState<ModelConfiguration[]>([]);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [configDialogMode, setConfigDialogMode] = useState<'create' | 'edit'>('create');
  const [configDraftJson, setConfigDraftJson] = useState('');
  const [configReason, setConfigReason] = useState('');
  const [configActionLoading, setConfigActionLoading] = useState(false);
  const [configActionError, setConfigActionError] = useState<string | null>(null);
  const [selectedConfig, setSelectedConfig] = useState<ModelConfiguration | null>(null);

  // Log connection status and mission info for debugging
  useEffect(() => {
    console.log('WebSocket connection status in Dashboard:', isConnected);
    console.log('Active mission in Dashboard:', activeMission, activeMissionId);

    // This effect runs when the component mounts and when connection status changes
    // We don't need to do anything special since the WebSocketContext maintains the connection
  }, [isConnected, activeMission, activeMissionId]);

  const handleBackToHome = () => {
    navigate('/');
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleConversationTypeChange = (event: SelectChangeEvent) => {
    setConversationType(event.target.value as LLMConversationType);
  };

  const handleRankingMetricChange = (event: SelectChangeEvent) => {
    setRankingMetric(event.target.value as 'successRate' | 'averageLatency' | 'overall');
  };

  useEffect(() => {
    // Use the singleton SecurityClient instance for authenticated API calls
    const securityClient = SecurityClient.getInstance(API_BASE_URL);

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get the authentication token
        const token = securityClient.getAccessToken();
        console.log('Using token for API request:', token ? `${token.substring(0, 10)}...` : 'No token available');

        if (!token) {
          console.log('No authentication token available. Please log in again.');
          setError('Authentication failed. Please log in again.');
          setLoading(false);
          return;
        }

        // Fetch all available models from Brain service
        const modelsResponse = await fetch(`${API_BASE_URL}/brain/models`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          credentials: 'include',
          mode: 'cors'
        });
        let allModels: string[] = [];
        if (modelsResponse.ok) {
          const modelsData = await modelsResponse.json();
          if (modelsData && Array.isArray(modelsData.models)) {
            allModels = modelsData.models;
          }
        }

        // Fetch performance data from PostOffice service (not Brain directly)
        const performanceResponse = await fetch(`${API_BASE_URL}/brain/performance`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          credentials: 'include',
          mode: 'cors'
        });

        if (!performanceResponse.ok) {
          throw new Error(`Failed to fetch performance data: ${performanceResponse.status} ${performanceResponse.statusText}`);
        }

        const performanceData = await performanceResponse.json();
        console.log('Performance data response:', performanceData);

        if (!performanceData || !performanceData.success || !performanceData.performanceData) {
          throw new Error('Invalid performance data response format');
        }

        // Convert the array of model data to a Record<string, ModelPerformanceMetrics>
        const formattedData: Record<string, ModelPerformanceMetrics> = {};
        const performanceDataArray = performanceData.performanceData;

        if (Array.isArray(performanceDataArray)) {
          performanceDataArray.forEach((modelData: any) => {
            if (modelData && modelData.modelName && modelData.metrics) {
              // Filter by conversation type if specified
              const conversationTypes = Object.keys(modelData.metrics);
              const matchingType = conversationTypes.find(type => type === conversationType) || conversationTypes[0];

              if (matchingType) {
                formattedData[modelData.modelName] = modelData.metrics[matchingType];
              }
            }
          });
        } else {
          console.warn('Performance data is not an array:', performanceDataArray);
        }

        // Merge allModels with formattedData so all models are present
        if (allModels.length > 0) {
          allModels.forEach(modelName => {
            if (!formattedData[modelName]) {
              formattedData[modelName] = {
                usageCount: 0,
                successCount: 0,
                failureCount: 0,
                successRate: 0,
                averageLatency: 0,
                averageTokenCount: 0,
                lastUsed: '',
                consecutiveFailures: 0,
                lastFailureTime: null,
                blacklistedUntil: null,
                feedbackScores: {
                  relevance: 0,
                  accuracy: 0,
                  helpfulness: 0,
                  creativity: 0,
                  overall: 0
                }
              };
            }
          });
        }

        setPerformanceData(formattedData);

        // Fetch rankings from the PostOffice service
        try {
          // Get a fresh token in case it was refreshed during the first API call
          const freshToken = securityClient.getAccessToken();
          // Check if we have a token
          if (!freshToken) {
            throw new Error('No authentication token available for rankings request');
          }

          const rankingsResponse = await fetch(
            `${API_BASE_URL}/brain/performance/rankings?conversationType=${conversationType}&metric=${rankingMetric}`,
            {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${freshToken}`
              },
              credentials: 'include',
              mode: 'cors'
            }
          );

          if (!rankingsResponse.ok) {
            throw new Error(`Failed to fetch rankings: ${rankingsResponse.status} ${rankingsResponse.statusText}`);
          }

          const rankingsData = await rankingsResponse.json();
          console.log('Rankings response:', rankingsData);

          if (rankingsData && rankingsData.success && Array.isArray(rankingsData.rankings)) {
            setRankings(rankingsData.rankings);
          } else {
            console.warn('Invalid rankings response format:', rankingsData);

            // If the rankings endpoint fails, generate rankings locally as a fallback
            const generatedRankings = Object.entries(formattedData).map(([modelName, metrics]) => {
              let score = 0;

              switch (rankingMetric) {
                case 'successRate':
                  score = metrics.successRate || 0;
                  break;
                case 'averageLatency':
                  // Invert latency so lower is better (max 10 seconds considered as baseline)
                  score = 1 - Math.min((metrics.averageLatency || 0) / 10000, 1);
                  break;
                case 'overall':
                default:
                  // Weighted combination of factors
                  score = (
                    ((metrics.successRate || 0) * 0.4) +
                    ((metrics.feedbackScores?.overall || 0) / 5 * 0.4) +
                    (1 - Math.min((metrics.averageLatency || 0) / 10000, 1)) * 0.2
                  );
                  break;
              }

              return { modelName, score };
            });

            // Sort by score (highest first)
            generatedRankings.sort((a, b) => b.score - a.score);

            setRankings(generatedRankings);
          }
        } catch (rankingsError) {
          console.error('Error fetching rankings:', rankingsError);

          // Generate rankings locally if the rankings endpoint fails
          const generatedRankings = Object.entries(formattedData).map(([modelName, metrics]) => {
            let score = 0;

            switch (rankingMetric) {
              case 'successRate':
                score = metrics.successRate || 0;
                break;
              case 'averageLatency':
                // Invert latency so lower is better (max 10 seconds considered as baseline)
                score = 1 - Math.min((metrics.averageLatency || 0) / 10000, 1);
                break;
              case 'overall':
              default:
                // Weighted combination of factors
                score = (
                  ((metrics.successRate || 0) * 0.4) +
                  ((metrics.feedbackScores?.overall || 0) / 5 * 0.4) +
                  (1 - Math.min((metrics.averageLatency || 0) / 10000, 1)) * 0.2
                );
                break;
            }

            return { modelName, score };
          });

          // Sort by score (highest first)
          generatedRankings.sort((a, b) => b.score - a.score);

          setRankings(generatedRankings);
        }

        setLoading(false);
      } catch (error) {
        console.error('Error fetching model performance data:', error);
        setError('Failed to fetch model performance data. Please try again later.');
        setLoading(false);
      }
    };

    fetchData();

    // Set up a refresh interval to keep the data up-to-date
    const refreshInterval = setInterval(fetchData, 30000); // Refresh every 30 seconds

    // Clean up the interval when the component unmounts
    return () => clearInterval(refreshInterval);
  }, [conversationType, rankingMetric]);

  const getConfigTemplate = (): ModelConfiguration => {
    const now = new Date().toISOString();
    return {
      id: '',
      name: '',
      provider: '',
      providerModelId: '',
      tokenLimit: 8192,
      costPer1kTokens: {
        input: 0,
        output: 0
      },
      supportedConversationTypes: [LLMConversationType.TextToText],
      status: 'active',
      deployedAt: now,
      rolloutPercentage: 100,
      providerCredentials: {
        keyVault: 'ENV',
        credentialName: '',
        validated: false
      },
      availability: {
        status: 'unknown'
      },
      healthChecks: {
        endpoint: '',
        method: 'GET',
        timeout: 5000,
        expectedStatusCodes: [200],
        frequency: 300000
      },
      sla: {
        successRateMinimum: 0.98,
        p99LatencyMs: 3000,
        availabilityPercentage: 0.99
      },
      metadata: {
        version: '1.0.0',
        releaseNotes: '',
        knownLimitations: [],
        optimizations: []
      },
      createdBy: 'ui',
      createdAt: now,
      updatedBy: 'ui',
      updatedAt: now
    };
  };

  const fetchModelConfigs = async () => {
    const securityClient = SecurityClient.getInstance(API_BASE_URL);
    try {
      setConfigLoading(true);
      setConfigError(null);
      const token = securityClient.getAccessToken();
      if (!token) {
        setConfigError('Authentication failed. Please log in again.');
        setConfigLoading(false);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/brain/models/config`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        mode: 'cors'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch model configs: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      setModelConfigs(Array.isArray(data?.models) ? data.models : []);
      setConfigLoading(false);
    } catch (configFetchError) {
      console.error('Error fetching model configs:', configFetchError);
      setConfigError('Failed to fetch model configurations. Please try again later.');
      setConfigLoading(false);
    }
  };

  useEffect(() => {
    fetchModelConfigs();
  }, []);

  const openCreateDialog = () => {
    setConfigDialogMode('create');
    setSelectedConfig(null);
    setConfigReason('');
    setConfigActionError(null);
    setConfigDraftJson(JSON.stringify(getConfigTemplate(), null, 2));
    setConfigDialogOpen(true);
  };

  const openEditDialog = (config: ModelConfiguration) => {
    setConfigDialogMode('edit');
    setSelectedConfig(config);
    setConfigReason('');
    setConfigActionError(null);
    setConfigDraftJson(JSON.stringify(config, null, 2));
    setConfigDialogOpen(true);
  };

  const closeConfigDialog = () => {
    setConfigDialogOpen(false);
    setConfigActionError(null);
  };

  const handleSaveConfig = async () => {
    const securityClient = SecurityClient.getInstance(API_BASE_URL);
    try {
      setConfigActionLoading(true);
      setConfigActionError(null);

      const token = securityClient.getAccessToken();
      if (!token) {
        setConfigActionError('Authentication failed. Please log in again.');
        setConfigActionLoading(false);
        return;
      }

      let parsedConfig: ModelConfiguration;
      try {
        parsedConfig = JSON.parse(configDraftJson);
      } catch (parseError) {
        setConfigActionError('Invalid JSON. Please fix the configuration payload.');
        setConfigActionLoading(false);
        return;
      }

      if (!parsedConfig?.id || !parsedConfig?.name || !parsedConfig?.provider) {
        setConfigActionError('Model configuration must include id, name, and provider.');
        setConfigActionLoading(false);
        return;
      }

      if (configDialogMode === 'create') {
        const response = await fetch(`${API_BASE_URL}/brain/models`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          credentials: 'include',
          mode: 'cors',
          body: JSON.stringify({ config: parsedConfig })
        });

        if (!response.ok) {
          throw new Error(`Failed to create model: ${response.status} ${response.statusText}`);
        }
      } else if (configDialogMode === 'edit') {
        const targetId = selectedConfig?.id || parsedConfig.id;
        const response = await fetch(`${API_BASE_URL}/brain/models/${targetId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          credentials: 'include',
          mode: 'cors',
          body: JSON.stringify({ updates: parsedConfig, reason: configReason || 'Updated via dashboard' })
        });

        if (!response.ok) {
          throw new Error(`Failed to update model: ${response.status} ${response.statusText}`);
        }
      }

      setConfigActionLoading(false);
      setConfigDialogOpen(false);
      await fetchModelConfigs();
    } catch (saveError) {
      console.error('Error saving model config:', saveError);
      setConfigActionError('Failed to save model configuration. Please review the payload and try again.');
      setConfigActionLoading(false);
    }
  };

  const handleDeleteConfig = async (config: ModelConfiguration) => {
    const securityClient = SecurityClient.getInstance(API_BASE_URL);
    const confirmed = window.confirm(`Archive model "${config.name}"? This will remove it from active models.`);
    if (!confirmed) {
      return;
    }

    try {
      setConfigActionLoading(true);
      const token = securityClient.getAccessToken();
      if (!token) {
        setConfigActionError('Authentication failed. Please log in again.');
        setConfigActionLoading(false);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/brain/models/${config.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        mode: 'cors'
      });

      if (!response.ok) {
        throw new Error(`Failed to archive model: ${response.status} ${response.statusText}`);
      }

      setConfigActionLoading(false);
      await fetchModelConfigs();
    } catch (deleteError) {
      console.error('Error deleting model config:', deleteError);
      setConfigActionError('Failed to archive model configuration. Please try again.');
      setConfigActionLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const getStatusColor = (metrics: ModelPerformanceMetrics | undefined) => {
    if (!metrics) {
      return 'default';
    }
    if (metrics.blacklistedUntil && new Date(metrics.blacklistedUntil) > new Date()) {
      return 'error';
    }
    if ((metrics.consecutiveFailures || 0) > 0) {
      return 'warning';
    }
    if ((metrics.successRate || 0) > 0.9) {
      return 'success';
    }
    return 'default';
  };

  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <AppBar position="static" color="primary" elevation={1} sx={{ mb: 2 }}>
        <Toolbar>
          <Button
            color="inherit"
            startIcon={<ArrowBackIcon />}
            onClick={handleBackToHome}
            sx={{ mr: 2 }}
          >
            Back to Home
          </Button>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Model Performance Dashboard
          </Typography>
        </Toolbar>
      </AppBar>

      <Box sx={{ px: 3, flexGrow: 1, overflow: 'auto' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs value={tabValue} onChange={handleTabChange} aria-label="model performance tabs">
            <Tab label="Performance Metrics" {...a11yProps(0)} />
            <Tab label="Model Rankings" {...a11yProps(1)} />
            <Tab label="Usage Statistics" {...a11yProps(2)} />
            <Tab label="Model Configurations" {...a11yProps(3)} />
          </Tabs>
        </Box>

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
          <TabPanel value={tabValue} index={0}>
            <TableContainer component={Paper}>
              <Table sx={{ minWidth: 650 }} aria-label="model performance table">
                <TableHead>
                  <TableRow>
                    <TableCell>Model</TableCell>
                    <TableCell align="right">Status</TableCell>
                    <TableCell align="right">Success Rate</TableCell>
                    <TableCell align="right">Avg. Latency</TableCell>
                    <TableCell align="right">Avg. Tokens</TableCell>
                    <TableCell align="right">Usage Count</TableCell>
                    <TableCell align="right">Last Used</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {Object.entries(performanceData).map(([modelName, data]) => (
                    <TableRow
                      key={modelName}
                      sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
                    >
                      <TableCell component="th" scope="row">
                        {modelName}
                      </TableCell>
                      <TableCell align="right">
                        <Chip
                          label={data?.blacklistedUntil && new Date(data.blacklistedUntil) > new Date() ? 'Blacklisted' : 'Active'}
                          color={getStatusColor(data)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="right">{((data?.successRate || 0) * 100).toFixed(1)}%</TableCell>
                      <TableCell align="right">{formatDuration(data?.averageLatency || 0)}</TableCell>
                      <TableCell align="right">{(data?.averageTokenCount || 0).toFixed(0)}</TableCell>
                      <TableCell align="right">{data?.usageCount || 0}</TableCell>
                      <TableCell align="right">{formatDate(data?.lastUsed || null)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </TabPanel>

          <TabPanel value={tabValue} index={1}>
            <Box sx={{ mb: 3 }}>
              <Grid container spacing={2}>
                <Grid {...({ xs: 12, sm: 6, item: true } as any)}>
                  <FormControl fullWidth>
                    <InputLabel id="conversation-type-label">Conversation Type</InputLabel>
                    <Select
                      labelId="conversation-type-label"
                      id="conversation-type-select"
                      value={conversationType}
                      label="Conversation Type"
                      onChange={handleConversationTypeChange}
                    >
                      <MenuItem value={LLMConversationType.TextToText}>Text to Text</MenuItem>
                      <MenuItem value={LLMConversationType.TextToCode}>Text to Code</MenuItem>
                      <MenuItem value={LLMConversationType.TextToImage}>Text to Image</MenuItem>
                      <MenuItem value={LLMConversationType.TextToAudio}>Text to Audio</MenuItem>
                      <MenuItem value={LLMConversationType.TextToVideo}>Text to Video</MenuItem>
                      <MenuItem value={LLMConversationType.ImageToText}>Image to Text</MenuItem>
                      <MenuItem value={LLMConversationType.AudioToText}>Audio to Text</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid {...({ xs: 12, sm: 6, item: true } as any)}>
                  <FormControl fullWidth>
                    <InputLabel id="ranking-metric-label">Ranking Metric</InputLabel>
                    <Select
                      labelId="ranking-metric-label"
                      id="ranking-metric-select"
                      value={rankingMetric}
                      label="Ranking Metric"
                      onChange={handleRankingMetricChange}
                    >
                      <MenuItem value="overall">Overall</MenuItem>
                      <MenuItem value="successRate">Success Rate</MenuItem>
                      <MenuItem value="averageLatency">Average Latency</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            </Box>

            <TableContainer component={Paper}>
              <Table sx={{ minWidth: 650 }} aria-label="model rankings table">
                <TableHead>
                  <TableRow>
                    <TableCell>Rank</TableCell>
                    <TableCell>Model</TableCell>
                    <TableCell align="right">Score</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rankings && rankings.length > 0 ? (
                    rankings.map((ranking, index) => (
                      <TableRow
                        key={ranking.modelName || `model-${index}`}
                        sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
                      >
                        <TableCell component="th" scope="row">
                          {index + 1}
                        </TableCell>
                        <TableCell>{ranking.modelName || 'Unknown'}</TableCell>
                        <TableCell align="right">{(ranking.score || 0).toFixed(2)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} align="center">No ranking data available</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </TabPanel>

          <TabPanel value={tabValue} index={2}>
            <Grid container spacing={3}>
              <Grid {...({ xs: 12, md: 6, item: true } as any)}>
                <Card>
                  <CardHeader title="Total Usage by Model" />
                  <Divider />
                  <CardContent>
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Model</TableCell>
                            <TableCell align="right">Usage Count</TableCell>
                            <TableCell align="right">Success Count</TableCell>
                            <TableCell align="right">Failure Count</TableCell>
                            <TableCell align="right">Success Rate</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {Object.entries(performanceData).map(([modelName, data]) => (
                            <TableRow key={modelName}>
                              <TableCell>{modelName}</TableCell>
                              <TableCell align="right">{data?.usageCount || 0}</TableCell>
                              <TableCell align="right">{data?.successCount || 0}</TableCell>
                              <TableCell align="right">{data?.failureCount || 0}</TableCell>
                              <TableCell align="right">{((data?.successRate || 0) * 100).toFixed(1)}%</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </CardContent>
                </Card>
              </Grid>
              <Grid {...({ xs: 12, md: 6, item: true } as any)}>
                <Card>
                  <CardHeader title="Feedback Scores" />
                  <Divider />
                  <CardContent>
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Model</TableCell>
                            <TableCell align="right">Relevance</TableCell>
                            <TableCell align="right">Accuracy</TableCell>
                            <TableCell align="right">Helpfulness</TableCell>
                            <TableCell align="right">Creativity</TableCell>
                            <TableCell align="right">Overall</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {Object.entries(performanceData).map(([modelName, data]) => (
                            <TableRow key={modelName}>
                              <TableCell>{modelName}</TableCell>
                              <TableCell align="right">{data?.feedbackScores?.relevance?.toFixed(1) || '0.0'}</TableCell>
                              <TableCell align="right">{data?.feedbackScores?.accuracy?.toFixed(1) || '0.0'}</TableCell>
                              <TableCell align="right">{data?.feedbackScores?.helpfulness?.toFixed(1) || '0.0'}</TableCell>
                              <TableCell align="right">{data?.feedbackScores?.creativity?.toFixed(1) || '0.0'}</TableCell>
                              <TableCell align="right">{data?.feedbackScores?.overall?.toFixed(1) || '0.0'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </CardContent>
                </Card>
              </Grid>
              <Grid {...({ xs: 12, item: true } as any)}>
                <Card>
                  <CardHeader title="Performance Metrics" />
                  <Divider />
                  <CardContent>
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Model</TableCell>
                            <TableCell align="right">Avg. Latency</TableCell>
                            <TableCell align="right">Avg. Tokens</TableCell>
                            <TableCell align="right">Last Used</TableCell>
                            <TableCell align="right">Consecutive Failures</TableCell>
                            <TableCell align="right">Blacklisted Until</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {Object.entries(performanceData).map(([modelName, data]) => (
                            <TableRow key={modelName}>
                              <TableCell>{modelName}</TableCell>
                              <TableCell align="right">{formatDuration(data?.averageLatency || 0)}</TableCell>
                              <TableCell align="right">{(data?.averageTokenCount || 0).toFixed(0)}</TableCell>
                              <TableCell align="right">{formatDate(data?.lastUsed || null)}</TableCell>
                              <TableCell align="right">{data?.consecutiveFailures || 0}</TableCell>
                              <TableCell align="right">{data?.blacklistedUntil ? formatDate(data.blacklistedUntil) : 'Not blacklisted'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </CardContent>
                </Card>
              </Grid>
              <Grid {...({ xs: 12, item: true } as any)}>
                <Card>
                  <CardHeader title="Usage Summary" />
                  <Divider />
                  <CardContent>
                    <Box sx={{ p: 2 }}>
                      <Typography variant="h6" gutterBottom>
                        Total API Calls: {Object.values(performanceData).reduce((sum, data) => sum + (data?.usageCount || 0), 0)}
                      </Typography>
                      <Typography variant="h6" gutterBottom>
                        Total Successful Calls: {Object.values(performanceData).reduce((sum, data) => sum + (data?.successCount || 0), 0)}
                      </Typography>
                      <Typography variant="h6" gutterBottom>
                        Total Failed Calls: {Object.values(performanceData).reduce((sum, data) => sum + (data?.failureCount || 0), 0)}
                      </Typography>
                      <Typography variant="h6" gutterBottom>
                        Overall Success Rate: {
                          (Object.values(performanceData).reduce((sum, data) => sum + (data?.successCount || 0), 0) /
                          Math.max(1, Object.values(performanceData).reduce((sum, data) => sum + (data?.usageCount || 0), 0)) * 100).toFixed(1)
                        }%
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </TabPanel>

          <TabPanel value={tabValue} index={3}>
            <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
              <Button variant="contained" onClick={openCreateDialog}>
                Add Model
              </Button>
              <Button variant="outlined" onClick={fetchModelConfigs} disabled={configLoading}>
                Refresh
              </Button>
            </Stack>

            {configError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {configError}
              </Alert>
            )}

            {configActionError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {configActionError}
              </Alert>
            )}

            {configLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
              </Box>
            ) : (
              <TableContainer component={Paper}>
                <Table sx={{ minWidth: 650 }} aria-label="model configurations table">
                  <TableHead>
                    <TableRow>
                      <TableCell>ID</TableCell>
                      <TableCell>Name</TableCell>
                      <TableCell>Provider</TableCell>
                      <TableCell>Provider Model</TableCell>
                      <TableCell align="right">Token Limit</TableCell>
                      <TableCell align="right">Rollout</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {modelConfigs.length > 0 ? (
                      modelConfigs.map(config => (
                        <TableRow key={config.id}>
                          <TableCell>{config.id}</TableCell>
                          <TableCell>{config.name}</TableCell>
                          <TableCell>{config.provider}</TableCell>
                          <TableCell>{config.providerModelId}</TableCell>
                          <TableCell align="right">{config.tokenLimit}</TableCell>
                          <TableCell align="right">{config.rolloutPercentage}%</TableCell>
                          <TableCell>
                            <Chip label={config.status} size="small" />
                          </TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={1} justifyContent="flex-end">
                              <Button size="small" variant="outlined" onClick={() => openEditDialog(config)}>
                                Edit
                              </Button>
                              <Button size="small" variant="outlined" color="error" onClick={() => handleDeleteConfig(config)}>
                                Archive
                              </Button>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={8} align="center">No model configurations found</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </TabPanel>
        </>
      )}
      </Box>

      <Dialog open={configDialogOpen} onClose={closeConfigDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          {configDialogMode === 'create' ? 'Add Model Configuration' : 'Edit Model Configuration'}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            {configDialogMode === 'edit' && (
              <TextField
                label="Change Reason"
                value={configReason}
                onChange={(event) => setConfigReason(event.target.value)}
                placeholder="Describe why this change is being made"
                fullWidth
              />
            )}
            <TextField
              label="Model Configuration (JSON)"
              value={configDraftJson}
              onChange={(event) => setConfigDraftJson(event.target.value)}
              multiline
              minRows={12}
              fullWidth
              helperText="Edit the full model configuration JSON. Required fields: id, name, provider, tokenLimit, rolloutPercentage, supportedConversationTypes, providerCredentials."
            />
            {configActionError && (
              <Alert severity="error">{configActionError}</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeConfigDialog} disabled={configActionLoading}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveConfig} disabled={configActionLoading}>
            {configActionLoading ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ModelPerformanceDashboard;




