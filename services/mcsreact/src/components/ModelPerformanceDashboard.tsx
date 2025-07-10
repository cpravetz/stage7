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
  Toolbar
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useWebSocket } from '../context/WebSocketContext';
import { API_BASE_URL } from '../config';
import { SecurityClient } from '../SecurityClient';

export enum LLMConversationType {
    TextToText = 'text/text',
    TextToImage = 'text/image',
    TextToAudio = 'text/audio',
    TextToVideo = 'text/video',
    AudioToText = 'audio/text',
    ImageToText = 'image/text',
    ImageToImage = 'image/image',
    ImageToAudio = 'image/audio',
    ImageToVideo = 'image/video',
    VideoToText = 'video/text',
    VideoToImage = 'video/image',
    VideoToAudio = 'video/audio',
    VideoToVideo = 'video/video',
    TextToCode = 'text/code',
    CodeToText = 'code/text',
}

interface ModelPerformanceMetrics {
  usageCount?: number;
  successCount?: number;
  failureCount?: number;
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
  const { isConnected, activeMission, activeMissionId } = useWebSocket();
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [performanceData, setPerformanceData] = useState<Record<string, ModelPerformanceMetrics>>({});
  const [rankings, setRankings] = useState<ModelRanking[]>([]);  // Initialize with empty array
  const [conversationType, setConversationType] = useState<LLMConversationType>(LLMConversationType.TextToText);
  const [rankingMetric, setRankingMetric] = useState<'successRate' | 'averageLatency' | 'overall'>('overall');

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

        // Fetch all available models
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

        // Use the fetch API with proper CORS settings
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
                <Grid item xs={12} sm={6}>
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
                      <MenuItem value={LLMConversationType.TextToImage}>Text to Image</MenuItem>
                      <MenuItem value={LLMConversationType.TextToAudio}>Text to Audio</MenuItem>
                      <MenuItem value={LLMConversationType.TextToVideo}>Text to Video</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
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
              <Grid item xs={12} md={6}>
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
              <Grid item xs={12} md={6}>
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
              <Grid item xs={12}>
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
              <Grid item xs={12}>
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
        </>
      )}
      </Box>
    </Box>
  );
};

export default ModelPerformanceDashboard;




