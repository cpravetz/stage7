import React, { useState } from 'react';
import { Box, Grid, Typography, Tabs, Tab } from '@mui/material';
import { ConversationMessage, DoraMetrics, Incident, SecurityAlert, CloudSpend } from '@cktmcs/sdk';
import { BaseAssistantPage } from '../shared/BaseAssistantPage';
import { ctoAssistantClient } from '../shared/assistantClients';
import { CTOAssistantMessageBuilder } from '../../utils/AssistantMessageBuilders';

import {
  INITIAL_DORA_METRICS,
  INITIAL_INCIDENTS,
  INITIAL_SECURITY_ALERTS,
  INITIAL_CLOUD_SPEND,
} from './ctoAssistantData';

import { DORAMetricsWidget } from './widgets/DORAMetricsWidget';
import { ActiveIncidentsWidget } from './widgets/ActiveIncidentsWidget';
import { SecurityAlertsWidget } from './widgets/SecurityAlertsWidget';
import { CloudSpendWidget } from './widgets/CloudSpendWidget';
import { ExecutiveSummaryWidget } from './widgets/ExecutiveSummaryWidget';
import { KubernetesHealthWidget } from './widgets/KubernetesHealthWidget';
import { CostTrendsWidget } from './widgets/CostTrendsWidget';
import { TeamHealthWidget } from './widgets/TeamHealthWidget';
import { IaCMonitoringWidget } from './widgets/IaCMonitoringWidget';
import { DatabaseOperationsWidget } from './widgets/DatabaseOperationsWidget';
import { ServiceMeshWidget } from './widgets/ServiceMeshWidget';
import { DisasterRecoveryWidget } from './widgets/DisasterRecoveryWidget';
import { ChatPanel } from '../../assistants/shared/components/ChatPanel';

// Helper functions to parse data from tool messages
function getLatestDataFromMessages<T>(messages: ConversationMessage[], toolName: string, dataKey: string): T | null {
  const toolMessages = (messages || []).filter(
    (msg) => msg.sender === 'tool' &&
    typeof msg.content === 'object' &&
    msg.content !== null &&
    (msg.content as any).tool === toolName &&
    (msg.content as any)[dataKey]
  );
  if (toolMessages.length > 0) {
    const latestMessage = toolMessages[toolMessages.length - 1];
    return (latestMessage.content as any)[dataKey] as T;
  }
  return null;
}

interface KubernetesHealth {
  cluster_status: string;
  healthy_nodes: number;
  total_nodes: number;
  at_risk_pods: number;
}

interface CostTrends {
  week_over_week_percent_change: number;
  trend_direction: string;
  forecasted_total: number;
}

interface TeamHealth {
  health_score: number;
  status: string;
  at_risk_members: number;
}

interface IaCMonitoring {
  total_resources: number;
  drift_detected: number;
  compliant_resources: number;
  non_compliant_resources: number;
  last_scan: string;
  tools: any;
  highest_risk_drifts: any[];
}

interface DatabaseOperations {
  total_instances: number;
  healthy_instances: number;
  instances: any[];
  backup_compliance_percent: number;
  performance_score: number;
}

interface ServiceMeshData {
  mesh_name: string;
  total_services: number;
  healthy_services: number;
  avg_latency_ms: number;
  error_rate_percent: number;
  services: any[];
  dependencies_mapped: number;
  virtual_services: number;
  destination_rules: number;
}

interface DisasterRecovery {
  overall_status: 'compliant' | 'at_risk' | 'non_compliant';
  rpo_metrics: any[];
  rto_metrics: any[];
  backup_storage_gb: number;
  backup_storage_quota_gb: number;
  last_failover_test_days_ago: number;
  compliance_percent: number;
}

interface AssistantRenderProps {
    messages: ConversationMessage[];
    sendMessage: (message: string) => Promise<void>;
  sendEvent?: (event: any) => Promise<void>;
    isLoading: boolean;
    error: string | null;
    humanInputRequired: { prompt: string; type: string; metadata: any; inputStepId: string; } | null;
    submitHumanInput: (response: string, inputStepId: string) => void;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const CTOAssistantPageView: React.FC<AssistantRenderProps> = ({ messages, sendMessage, isLoading, error, humanInputRequired, submitHumanInput }) => {
    const [tabValue, setTabValue] = useState(0);
    
    const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
      setTabValue(newValue);
    };

    // Parse the latest data from the message history, or use initial data as a fallback
    const doraMetrics = getLatestDataFromMessages<DoraMetrics>(messages, 'DatadogTool', 'doraMetrics') || INITIAL_DORA_METRICS;
    const incidents = getLatestDataFromMessages<Incident[]>(messages, 'PagerDutyTool', 'incidents') || INITIAL_INCIDENTS;
    const securityAlerts = getLatestDataFromMessages<SecurityAlert[]>(messages, 'GitHubTool', 'securityAlerts') || INITIAL_SECURITY_ALERTS;
    const cloudSpend = getLatestDataFromMessages<CloudSpend>(messages, 'AWSTool', 'cloudSpend') || INITIAL_CLOUD_SPEND;
    const kubernetesHealth = getLatestDataFromMessages<KubernetesHealth>(messages, 'KubernetesTool', 'cluster_health');
    const costTrends = getLatestDataFromMessages<CostTrends>(messages, 'CostOptimizationTool', 'cost_trends');
    const teamHealth = getLatestDataFromMessages<TeamHealth>(messages, 'TeamMetricsTool', 'team_health');
    const iacMonitoring = getLatestDataFromMessages<IaCMonitoring>(messages, 'IaCMonitoringTool', 'iac_status');
    const databaseOps = getLatestDataFromMessages<DatabaseOperations>(messages, 'DatabaseOperationsTool', 'database_status');
    const serviceMesh = getLatestDataFromMessages<ServiceMeshData>(messages, 'ServiceMeshTool', 'mesh_status');
    const disasterRecovery = getLatestDataFromMessages<DisasterRecovery>(messages, 'DisasterRecoveryTool', 'dr_status');

    return (
        <Box sx={{ display: 'flex', height: '100%', width: '100%' }}>
            {/* Left side for specialized UI (dashboard) */}
            <Box sx={{ flexGrow: 1, overflowY: 'auto', width: '50%' }}>
              <Box sx={{ flexGrow: 1, backgroundColor: '#f4f6f8', height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ p: 2, backgroundColor: '#ffffff', borderBottom: '1px solid #e0e0e0' }}>
                  <Typography variant="h4" sx={{ color: '#1a237e', mb: 2 }}>
                    CTO Command Center
                  </Typography>
                  <Tabs value={tabValue} onChange={handleTabChange} sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tab label="Executive Summary" />
                    <Tab label="Engineering" />
                    <Tab label="Operations" />
                    <Tab label="Security" />
                    <Tab label="Financial" />
                    <Tab label="Infrastructure" />
                    <Tab label="Database & Mesh" />
                  </Tabs>
                </Box>

                <Box sx={{ flexGrow: 1, overflowY: 'auto', backgroundColor: '#f4f6f8' }}>
                  {/* Executive Summary Tab */}
                  <TabPanel value={tabValue} index={0}>
                    <Grid container spacing={3}>
                      <Grid item xs={12}>
                        <Box sx={{ backgroundColor: '#ffffff', p: 3, borderRadius: 2, boxShadow: 1 }}>
                          <ExecutiveSummaryWidget
                            activeIncidents={incidents.length}
                            criticalVulnerabilities={securityAlerts.filter(a => a.severity === 'Critical').length}
                          />
                        </Box>
                      </Grid>
                    </Grid>
                  </TabPanel>

                  {/* Engineering Tab */}
                  <TabPanel value={tabValue} index={1}>
                    <Grid container spacing={3}>
                      <Grid item xs={12}>
                        <Box sx={{ backgroundColor: '#ffffff', p: 3, borderRadius: 2, boxShadow: 1 }}>
                          <DORAMetricsWidget metrics={doraMetrics} />
                        </Box>
                      </Grid>
                      {teamHealth && (
                        <Grid item xs={12}>
                          <Box sx={{ backgroundColor: '#ffffff', p: 3, borderRadius: 2, boxShadow: 1 }}>
                            <TeamHealthWidget data={teamHealth} />
                          </Box>
                        </Grid>
                      )}
                    </Grid>
                  </TabPanel>

                  {/* Operations Tab */}
                  <TabPanel value={tabValue} index={2}>
                    <Grid container spacing={3}>
                      {kubernetesHealth && (
                        <Grid item xs={12}>
                          <Box sx={{ backgroundColor: '#ffffff', p: 3, borderRadius: 2, boxShadow: 1 }}>
                            <KubernetesHealthWidget data={kubernetesHealth} />
                          </Box>
                        </Grid>
                      )}
                      <Grid item xs={12}>
                        <Box sx={{ backgroundColor: '#ffffff', p: 3, borderRadius: 2, boxShadow: 1 }}>
                          <ActiveIncidentsWidget incidents={incidents} />
                        </Box>
                      </Grid>
                    </Grid>
                  </TabPanel>

                  {/* Security Tab */}
                  <TabPanel value={tabValue} index={3}>
                    <Grid container spacing={3}>
                      <Grid item xs={12}>
                        <Box sx={{ backgroundColor: '#ffffff', p: 3, borderRadius: 2, boxShadow: 1 }}>
                          <SecurityAlertsWidget alerts={securityAlerts} />
                        </Box>
                      </Grid>
                    </Grid>
                  </TabPanel>

                  {/* Financial Tab */}
                  <TabPanel value={tabValue} index={4}>
                    <Grid container spacing={3}>
                      <Grid item xs={12}>
                        <Box sx={{ backgroundColor: '#ffffff', p: 3, borderRadius: 2, boxShadow: 1 }}>
                          <CloudSpendWidget data={cloudSpend} />
                        </Box>
                      </Grid>
                      {costTrends && (
                        <Grid item xs={12}>
                          <Box sx={{ backgroundColor: '#ffffff', p: 3, borderRadius: 2, boxShadow: 1 }}>
                            <CostTrendsWidget data={costTrends} />
                          </Box>
                        </Grid>
                      )}
                    </Grid>
                  </TabPanel>

                  {/* Infrastructure & Compliance Tab */}
                  <TabPanel value={tabValue} index={5}>
                    <Grid container spacing={3}>
                      {iacMonitoring && (
                        <Grid item xs={12}>
                          <Box sx={{ backgroundColor: '#ffffff', p: 3, borderRadius: 2, boxShadow: 1 }}>
                            <IaCMonitoringWidget data={iacMonitoring} />
                          </Box>
                        </Grid>
                      )}
                      {disasterRecovery && (
                        <Grid item xs={12}>
                          <Box sx={{ backgroundColor: '#ffffff', p: 3, borderRadius: 2, boxShadow: 1 }}>
                            <DisasterRecoveryWidget data={disasterRecovery} />
                          </Box>
                        </Grid>
                      )}
                    </Grid>
                  </TabPanel>

                  {/* Database & Service Mesh Tab */}
                  <TabPanel value={tabValue} index={6}>
                    <Grid container spacing={3}>
                      {databaseOps && (
                        <Grid item xs={12}>
                          <Box sx={{ backgroundColor: '#ffffff', p: 3, borderRadius: 2, boxShadow: 1 }}>
                            <DatabaseOperationsWidget data={databaseOps} />
                          </Box>
                        </Grid>
                      )}
                      {serviceMesh && (
                        <Grid item xs={12}>
                          <Box sx={{ backgroundColor: '#ffffff', p: 3, borderRadius: 2, boxShadow: 1 }}>
                            <ServiceMeshWidget data={serviceMesh} />
                          </Box>
                        </Grid>
                      )}
                    </Grid>
                  </TabPanel>
                </Box>
              </Box>
            </Box>

            {/* Right side for StandardAssistantChat */}
            <Box sx={{ width: '50%', borderLeft: '1px solid #e0e0e0' }}>
              <ChatPanel messages={messages} onSendMessage={sendMessage} isLoading={isLoading} error={error} assistantName="CTO Assistant" enableVoiceInput={true} />
            </Box>
          </Box>
    );
};

const CTOAssistantPage: React.FC<{ clientId: string }> = ({ clientId }) => {
  return (
    <BaseAssistantPage
      title="CTO Assistant"
      description="Your AI partner for monitoring software engineering, security, and cloud operations. Get help with software development, security, and cloud operations."
      client={ctoAssistantClient}
      initialPrompt="Hello! I need help monitoring software engineering, security, and cloud operations."
      clientId={clientId}
    >
      {(props) => <CTOAssistantPageView {...props} />}
    </BaseAssistantPage>
  );
};

export default CTOAssistantPage;


