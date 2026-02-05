import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { BaseAssistantPage } from '../shared/BaseAssistantPage';
import { performanceAnalyticsAssistantClient, performanceAnalyticsDataClient } from '../shared/assistantClients';
import { Button, Chip, Tabs, Tab, Box, Typography, useTheme, useMediaQuery, Select, MenuItem, FormControl, InputLabel, CircularProgress, Alert } from '@mui/material/index.js';
import { ConversationMessage } from '@cktmcs/sdk';
import { useParams } from 'react-router-dom';
import { ChatPanel } from '../../assistants/shared/components/ChatPanel';

// Define types for performance analytics domain
type PerformanceDomain = 'executive' | 'hr' | 'marketing' | 'sales';

interface PerformanceItem {
  id: string;
  name: string;
  [key: string]: any;
}

interface PerformanceMetric {
  id: string;
  name: string;
  currentValue: number;
  targetValue: number;
  trend: 'up' | 'down' | 'stable';
}

interface PerformanceProgram {
  id: string;
  name: string;
  [key: string]: any;
}

interface DomainLabels {
  title: string;
  description: string;
  itemLabels: {
    singular: string;
    plural: string;
  };
  programLabels: {
    singular: string;
    plural: string;
  };
}

// Domain label configurations (no data, just labels)
const domainLabels: Record<PerformanceDomain, DomainLabels> = {
  executive: {
    title: 'Executive Performance Analytics',
    description: 'Analyze business unit performance, track strategic initiatives, monitor executive KPIs, and optimize corporate strategy.',
    itemLabels: { singular: 'Business Unit', plural: 'Business Units' },
    programLabels: { singular: 'Strategic Initiative', plural: 'Strategic Initiatives' }
  },
  hr: {
    title: 'HR Performance Analytics',
    description: 'Analyze employee performance, track HR metrics, monitor training programs, and optimize workforce strategies.',
    itemLabels: { singular: 'Employee', plural: 'Employees' },
    programLabels: { singular: 'Training Program', plural: 'Training Programs' }
  },
  marketing: {
    title: 'Marketing Performance Analytics',
    description: 'Analyze marketing campaigns, track key metrics, monitor social media performance, and optimize marketing strategies.',
    itemLabels: { singular: 'Campaign', plural: 'Campaigns' },
    programLabels: { singular: 'Social Media Channel', plural: 'Social Media Channels' }
  },
  sales: {
    title: 'Sales Performance Analytics',
    description: 'Analyze sales performance, track key metrics, monitor KPIs, and optimize sales strategies.',
    itemLabels: { singular: 'Salesperson', plural: 'Salespeople' },
    programLabels: { singular: 'Performance KPI', plural: 'Performance KPIs' }
  }
};

// Performance Dashboard Component
const PerformanceDashboard = ({
  domain,
  items,
  isLoading,
  error,
  itemLabels,
  sendMessage
}: {
  domain: PerformanceDomain;
  items: PerformanceItem[];
  isLoading: boolean;
  error: string | null;
  itemLabels: { singular: string; plural: string; };
  sendMessage: (message: string) => Promise<void>
}) => {
  const [selectedItem, setSelectedItem] = useState<PerformanceItem | null>(null);

  if (isLoading) {
    return <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>;
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!items || items.length === 0) {
    return <Alert severity="info">No {itemLabels.plural.toLowerCase()} data available</Alert>;
  }

  const handleItemAnalysis = (item: PerformanceItem) => {
    setSelectedItem(item);
    
    let message = `Analyze performance for ${itemLabels.singular.toLowerCase()} ${item.name}`;
    
    if (domain === 'executive') {
      message += ` with revenue $${item.revenue?.toLocaleString() || 'N/A'} and growth rate ${item.growthRate || 'N/A'}%. Target revenue: $${item.targetRevenue?.toLocaleString() || 'N/A'}`;
    } else if (domain === 'hr') {
      message += ` with score ${item.performanceScore || 'N/A'} out of ${item.targetScore || 'N/A'} in ${item.department || 'N/A'} department`;
    } else if (domain === 'marketing') {
      message += ` with ROI ${item.roi || 'N/A'}% and budget $${item.budget?.toLocaleString() || 'N/A'}. Status: ${item.status || 'N/A'}`;
    } else if (domain === 'sales') {
      message += ` with quota ${item.quota?.toLocaleString() || 'N/A'} and achieved ${item.achieved?.toLocaleString() || 'N/A'}`;
    }
    
    sendMessage(message);
  };

  const calculatePerformanceRate = (item: PerformanceItem): number => {
    if (domain === 'executive' && item.revenue && item.targetRevenue) {
      return Math.round((item.revenue / item.targetRevenue) * 100);
    } else if (domain === 'hr' && item.performanceScore && item.targetScore) {
      return Math.round((item.performanceScore / item.targetScore) * 100);
    } else if (domain === 'marketing' && item.roi && item.targetROI) {
      return Math.round((item.roi / item.targetROI) * 100);
    } else if (domain === 'sales' && item.achieved && item.quota) {
      return Math.round((item.achieved / item.quota) * 100);
    }
    return 0;
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" gutterBottom>
          {itemLabels.plural} Performance Dashboard
        </Typography>
      </Box>
      
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map((item) => (
          <Box key={item.id} sx={{ p: 2, border: '1px solid #e0e0e0', borderRadius: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="subtitle1" gutterBottom>
                  {item.name}
                </Typography>
                {domain === 'executive' && (
                  <>
                    <Typography variant="body2" color="text.secondary">
                      Revenue: ${item.revenue?.toLocaleString() || 'N/A'}
                    </Typography>
                    <Typography variant="h6" color={calculatePerformanceRate(item) >= 90 ? 'success.main' : 'warning.main'}>
                      {item.growthRate || 0}% Growth
                    </Typography>
                  </>
                )}
                {domain === 'hr' && (
                  <>
                    <Typography variant="body2" color="text.secondary">
                      {item.position || 'N/A'}, {item.department || 'N/A'}
                    </Typography>
                    <Typography variant="h6" color={calculatePerformanceRate(item) >= 90 ? 'success.main' : 'warning.main'}>
                      {calculatePerformanceRate(item)}%
                    </Typography>
                  </>
                )}
                {domain === 'marketing' && (
                  <>
                    <Typography variant="body2" color="text.secondary">
                      Budget: ${item.budget?.toLocaleString() || 'N/A'} | Status: {item.status || 'N/A'}
                    </Typography>
                    <Typography variant="h6" color={calculatePerformanceRate(item) >= 90 ? 'success.main' : 'warning.main'}>
                      {item.roi || 0}% ROI
                    </Typography>
                  </>
                )}
                {domain === 'sales' && (
                  <>
                    <Typography variant="body2" color="text.secondary">
                      Quota: ${item.quota?.toLocaleString() || 'N/A'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Achieved: ${item.achieved?.toLocaleString() || 'N/A'}
                    </Typography>
                    <Typography variant="h6" color={calculatePerformanceRate(item) >= (item.targetAchievementRate || 100) ? 'success.main' : 'error.main'}>
                      {calculatePerformanceRate(item)}%
                    </Typography>
                  </>
                )}
              </Box>
              <Box>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => handleItemAnalysis(item)}
                  sx={{ ml: 1 }}
                >
                  Analyze
                </Button>
              </Box>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

// Metrics Tracker Component
const MetricsTracker = ({
  domain,
  metrics,
  isLoading,
  error,
  sendMessage
}: {
  domain: PerformanceDomain;
  metrics: PerformanceMetric[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (message: string) => Promise<void>
}) => {
  const [focusedMetric, setFocusedMetric] = useState<PerformanceMetric | null>(null);

  if (isLoading) {
    return <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>;
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!metrics || metrics.length === 0) {
    return <Alert severity="info">No metrics data available</Alert>;
  }

  const handleMetricAnalysis = (metric: PerformanceMetric) => {
    setFocusedMetric(metric);
    sendMessage(`Analyze ${metric.name} performance. Current value is ${metric.currentValue}, target is ${metric.targetValue}, trend is ${metric.trend}`);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" gutterBottom>
          Performance Metrics Tracker
        </Typography>
      </Box>
      
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {metrics.map((metric) => (
          <Box key={metric.id} sx={{ p: 2, border: '1px solid #e0e0e0', borderRadius: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="subtitle1">{metric.name}</Typography>
                <Typography variant="h6">
                  {metric.name.includes('Rate') || metric.name.includes('Satisfaction') ? metric.currentValue + '%' : metric.currentValue}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Target: {metric.name.includes('Rate') || metric.name.includes('Satisfaction') ? metric.targetValue + '%' : metric.targetValue}
                </Typography>
              </Box>
              <Box>
                <Chip
                  label={metric.trend}
                  color={metric.trend === 'up' ? 'success' : metric.trend === 'down' ? 'error' : 'default'}
                  size="small"
                  sx={{ mr: 1 }}
                />
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => handleMetricAnalysis(metric)}
                >
                  Analyze
                </Button>
              </Box>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

// Program Tracker Component
const ProgramTracker = ({
  domain,
  programs,
  isLoading,
  error,
  programLabels,
  sendMessage
}: {
  domain: PerformanceDomain;
  programs: PerformanceProgram[];
  isLoading: boolean;
  error: string | null;
  programLabels: { singular: string; plural: string; };
  sendMessage: (message: string) => Promise<void>
}) => {
  if (isLoading) {
    return <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>;
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!programs || programs.length === 0) {
    return <Alert severity="info">No {programLabels.plural.toLowerCase()} data available</Alert>;
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" gutterBottom>
          {programLabels.plural} Tracker
        </Typography>
      </Box>
      
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {programs.map((program) => (
          <Box key={program.id} sx={{ p: 2, border: '1px solid #e0e0e0', borderRadius: 1 }}>
            <Typography variant="subtitle1">{program.name}</Typography>
            <Box sx={{ mt: 1, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {Object.entries(program).map(([key, value]) => {
                if (key === 'id' || key === 'name' || key === 'domain') return null;
                return (
                  <Box key={key} sx={{ p: 1, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      {key.replace(/([A-Z])/g, ' $1').toLowerCase()}
                    </Typography>
                    <Typography variant="body2">{String(value)}</Typography>
                  </Box>
                );
              })}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

// Main Performance View Component
const PerformanceAnalyticsView = ({
  messages,
  sendMessage,
  isLoading,
  error,
  humanInputRequired,
  submitHumanInput,
}: {
  messages: ConversationMessage[];
  sendMessage: (message: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  humanInputRequired: { prompt: string; type: string; metadata: any; inputStepId: string; } | null;
  submitHumanInput: (response: string, inputStepId: string) => void;
}) => {
  const [domain, setDomain] = useState<PerformanceDomain>('executive');
  const [items, setItems] = useState<PerformanceItem[]>([]);
  const [metrics, setMetrics] = useState<PerformanceMetric[]>([]);
  const [programs, setPrograms] = useState<PerformanceProgram[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);

  const labels = domainLabels[domain];

  // Fetch data when domain changes
  useEffect(() => {
    const fetchDomainData = async () => {
      setDataLoading(true);
      setDataError(null);
      try {
        const response = await performanceAnalyticsDataClient.getDomainData(domain);
        setItems(response.items || []);
        setMetrics(response.metrics || []);
        setPrograms(response.programs || []);
      } catch (err) {
        setDataError(`Failed to load ${domain} data. Please check the backend service.`);
        console.error('Error fetching domain data:', err);
        setItems([]);
        setMetrics([]);
        setPrograms([]);
      } finally {
        setDataLoading(false);
      }
    };

    fetchDomainData();
  }, [domain]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  return (
    <Box sx={{ display: 'flex', height: '100%', width: '100%' }}>
      <Box sx={{ flexGrow: 1, overflowY: 'auto', width: '50%', p: 3 }}>
        <FormControl sx={{ mb: 3, minWidth: 250 }}>
          <InputLabel>Domain</InputLabel>
          <Select
            value={domain}
            label="Domain"
            onChange={(e) => setDomain(e.target.value as PerformanceDomain)}
          >
            <MenuItem value="executive">Executive</MenuItem>
            <MenuItem value="hr">HR</MenuItem>
            <MenuItem value="marketing">Marketing</MenuItem>
            <MenuItem value="sales">Sales</MenuItem>
          </Select>
        </FormControl>

        <Box sx={{ mb: 3 }}>
          <Typography variant="h5" gutterBottom>{labels.title}</Typography>
          <Typography variant="body2" color="text.secondary">{labels.description}</Typography>
        </Box>

        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs
            value={tabValue}
            onChange={handleTabChange}
            indicatorColor="primary"
            textColor="primary"
            variant="scrollable"
            scrollButtons="auto"
          >
            <Tab label={`${labels.itemLabels.plural} (${items.length})`} />
            <Tab label={`Metrics (${metrics.length})`} />
            <Tab label={`${labels.programLabels.plural} (${programs.length})`} />
          </Tabs>
        </Box>

        {tabValue === 0 && (
          <PerformanceDashboard
            domain={domain}
            items={items}
            isLoading={dataLoading}
            error={dataError}
            itemLabels={labels.itemLabels}
            sendMessage={sendMessage}
          />
        )}

        {tabValue === 1 && (
          <MetricsTracker
            domain={domain}
            metrics={metrics}
            isLoading={dataLoading}
            error={dataError}
            sendMessage={sendMessage}
          />
        )}

        {tabValue === 2 && (
          <ProgramTracker
            domain={domain}
            programs={programs}
            isLoading={dataLoading}
            error={dataError}
            programLabels={labels.programLabels}
            sendMessage={sendMessage}
          />
        )}
      </Box>

      <Box sx={{ width: '50%', borderLeft: '1px solid #e0e0e0' }}>
        <ChatPanel messages={messages} onSendMessage={sendMessage} isLoading={isLoading} error={error} assistantName="Performance Analytics Assistant" enableVoiceInput={true} />
      </Box>
    </Box>
  );
};

const PerformanceAnalyticsAssistant: React.FC<{ clientId: string }> = ({ clientId }) => {
  return (
    <BaseAssistantPage
      title="Performance Analytics Assistant"
      description="Analyze performance metrics across Executive, HR, Marketing, and Sales domains with data-driven insights."
      client={performanceAnalyticsAssistantClient}
      initialPrompt="Hello! I can help you analyze performance data across your organization."
      clientId={clientId}
    >
      {(props) => <PerformanceAnalyticsView {...props} />}
    </BaseAssistantPage>
  );
};

export default PerformanceAnalyticsAssistant;



