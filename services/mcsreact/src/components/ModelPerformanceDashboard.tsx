import React, { useState, useEffect } from 'react';
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
  SelectChangeEvent
} from '@mui/material';
import axios from 'axios';

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
  usageCount: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  averageLatency: number;
  averageTokenCount: number;
  lastUsed: string;
  consecutiveFailures: number;
  lastFailureTime: string | null;
  blacklistedUntil: string | null;
  feedbackScores: {
    relevance: number;
    accuracy: number;
    helpfulness: number;
    creativity: number;
    overall: number;
  };
}

interface ModelRanking {
  modelName: string;
  score: number;
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
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [performanceData, setPerformanceData] = useState<Record<string, ModelPerformanceMetrics>>({});
  const [rankings, setRankings] = useState<ModelRanking[]>([]);
  const [conversationType, setConversationType] = useState<LLMConversationType>(LLMConversationType.TextToText);
  const [rankingMetric, setRankingMetric] = useState<'successRate' | 'averageLatency' | 'overall'>('overall');

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleConversationTypeChange = (event: SelectChangeEvent) => {
    setConversationType(event.target.value as LLMConversationType);
  };

  const handleRankingMetricChange = (event: SelectChangeEvent) => {
    setRankingMetric(event.target.value as 'successRate' | 'averageLatency' | 'overall');
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch performance data
        const performanceResponse = await axios.get('/brain/performance');

        // Convert the array of model data to a Record<string, ModelPerformanceMetrics>
        const formattedData: Record<string, ModelPerformanceMetrics> = {};
        if (Array.isArray(performanceResponse.data.performanceData)) {
          performanceResponse.data.performanceData.forEach((modelData: any) => {
            if (modelData && modelData.modelName && modelData.metrics) {
              // Use the first conversation type's metrics as the default
              const conversationTypes = Object.keys(modelData.metrics);
              if (conversationTypes.length > 0) {
                formattedData[modelData.modelName] = modelData.metrics[conversationTypes[0]];
              }
            }
          });
        }

        setPerformanceData(formattedData);

        // Fetch rankings
        const rankingsResponse = await axios.get(`/brain/performance/rankings?conversationType=${conversationType}&metric=${rankingMetric}`);
        setRankings(rankingsResponse.data.rankings);

        setLoading(false);
      } catch (error) {
        console.error('Error fetching model performance data:', error);
        setError('Failed to fetch model performance data. Please try again later.');
        setLoading(false);
      }
    };

    fetchData();
  }, [conversationType, rankingMetric]);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const getStatusColor = (metrics: ModelPerformanceMetrics) => {
    if (metrics.blacklistedUntil && new Date(metrics.blacklistedUntil) > new Date()) {
      return 'error';
    }
    if (metrics.consecutiveFailures > 0) {
      return 'warning';
    }
    if (metrics.successRate > 0.9) {
      return 'success';
    }
    return 'default';
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="h4" gutterBottom>
        Model Performance Dashboard
      </Typography>

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
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
                          label={data.blacklistedUntil && new Date(data.blacklistedUntil) > new Date() ? 'Blacklisted' : 'Active'}
                          color={getStatusColor(data)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="right">{(data.successRate * 100).toFixed(1)}%</TableCell>
                      <TableCell align="right">{formatDuration(data.averageLatency)}</TableCell>
                      <TableCell align="right">{data.averageTokenCount.toFixed(0)}</TableCell>
                      <TableCell align="right">{data.usageCount}</TableCell>
                      <TableCell align="right">{formatDate(data.lastUsed)}</TableCell>
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
                  {rankings.map((ranking, index) => (
                    <TableRow
                      key={ranking.modelName}
                      sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
                    >
                      <TableCell component="th" scope="row">
                        {index + 1}
                      </TableCell>
                      <TableCell>{ranking.modelName}</TableCell>
                      <TableCell align="right">{ranking.score.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
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
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {Object.entries(performanceData).map(([modelName, data]) => (
                            <TableRow key={modelName}>
                              <TableCell>{modelName}</TableCell>
                              <TableCell align="right">{data?.usageCount || 0}</TableCell>
                              <TableCell align="right">{data?.successCount || 0}</TableCell>
                              <TableCell align="right">{data?.failureCount || 0}</TableCell>
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
            </Grid>
          </TabPanel>
        </>
      )}
    </Box>
  );
};

export default ModelPerformanceDashboard;
