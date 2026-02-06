import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { BaseAssistantPage } from '../shared/BaseAssistantPage';
import { salesAssistantClient } from '../shared/assistantClients';
import { SalesAssistantMessageBuilder } from '../../utils/AssistantMessageBuilders';
import { Tabs, Tab, Box, Typography } from '@mui/material/index.js';
import { ConversationMessage } from '@cktmcs/sdk';
import {
  Deal,
  Salesperson,
  Lead,
  Customer,
  SalesActivity,
  SalesForecast,
  PerformanceMetric,
  PipelineOverviewToolContent,
  LeadManagementToolContent,
  Customer360ToolContent,
  ActivityTrackingToolContent,
  SalesForecastingToolContent,
  PerformanceAnalyticsToolContent,
  ReportingCenterToolContent,
  isPipelineOverviewToolContent,
  isLeadManagementToolContent,
  isCustomer360ToolContent,
  isActivityTrackingToolContent,
  isSalesForecastingToolContent,
  isPerformanceAnalyticsToolContent,
  isReportingCenterToolContent
} from './types';

import PipelineOverview from './PipelineOverview';
import LeadManagementDashboard from './LeadManagementDashboard';
import Customer360View from './Customer360View';
import ActivityTimeline from './ActivityTimeline';
import SalesForecastingInterface from './SalesForecastingInterface';
import PerformanceAnalytics from './PerformanceAnalytics';
import ReportingCenter from './ReportingCenter';
import { ChatPanel } from '../../assistants/shared/components/ChatPanel';

// Separate component to hold the state and render logic
const SalesCRMContent: React.FC<{
  messages: ConversationMessage[];
  sendMessage: (message: string) => Promise<void>;
  sendEvent: (event: any) => Promise<void>;
  assistantState?: Record<string, any>;
  getState: (collectionName: string) => any[];
  mergeAssistantState?: (updates: Record<string, any>) => void;
  conversationId?: string;
  isLoading: boolean;
  error: string | null;
  clientId: string;
}> = ({ messages, sendMessage, sendEvent, assistantState = {}, getState, mergeAssistantState = () => {}, conversationId, isLoading, error, clientId }) => {
  const [tabValue, setTabValue] = useState(0);

  const buildEvent = useCallback((eventType: string, payload: any, entityId?: string) => ({
    type: eventType,
    payload: { ...payload, conversationId },
    entityId: entityId || payload.id || `${eventType}-${Date.now()}`
  }), [conversationId]);

  useEffect(() => {
    if (conversationId) {
      const collections = ['deal', 'lead', 'customer', 'salesActivity', 'salesForecast', 'performanceMetric'];
      collections.forEach(collection => {
        sendEvent(buildEvent(`domain.${collection}.load`, { conversationId }));
      });
    }
  }, [conversationId, sendEvent, buildEvent]);

        const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
          setTabValue(newValue);
        };

        const deals = useMemo(() => 
          assistantState?.deal || [],
          [assistantState]
        );

        const leads = useMemo(() => 
          assistantState?.lead || [],
          [assistantState]
        );

        const customers = useMemo(() => 
          assistantState?.customer || [],
          [assistantState]
        );

        const activities = useMemo(() => 
          assistantState?.salesActivity || [],
          [assistantState]
        );

        const forecasts = useMemo(() => 
          assistantState?.salesForecast || [],
          [assistantState]
        );

        const performanceMetrics = useMemo(() => 
          assistantState?.performanceMetric || [],
          [assistantState]
        );

        const reports = useMemo(() => 
          assistantState?.report || [],
          [assistantState]
        );

        return (
          <Box sx={{ display: 'flex', height: '100%', width: '100%' }}>
            {/* Left side for specialized UI (tabs) */}
            <Box sx={{ flexGrow: 1, overflowY: 'auto', width: '50%' }}>
              <Box component="div" sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tabs
                  value={tabValue}
                  onChange={handleTabChange}
                  indicatorColor="primary"
                  textColor="primary"
                  variant="scrollable"
                  scrollButtons="auto"
                  aria-label="sales CRM assistant features tabs"
                >
                  <Tab label="Pipeline Overview" />
                  <Tab label="Lead Management" />
                  <Tab label="Customer 360" />
                  <Tab label="Activity Timeline" />
                  <Tab label="Sales Forecasting" />
                  <Tab label="Performance Analytics" />
                  <Tab label="Reporting Center" />
                </Tabs>
              </Box>

              <Box role="tabpanel" hidden={tabValue !== 0} id="sales-crm-assistant-tabpanel-0" aria-labelledby="sales-crm-assistant-tab-0">
                {tabValue === 0 && (
                  <Box sx={{ p: 3 }}>
                    <PipelineOverview
                      deals={deals}
                      onCreateDeal={(deal: Deal) => {
                        const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                        const msg = SalesAssistantMessageBuilder.createDeal(missionId, clientId, clientId, { deal });
                        sendMessage(JSON.stringify(msg));
                      }}
                      onUpdateDeal={(id: string, updates: Partial<Deal>) => {
                        const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                        const msg = SalesAssistantMessageBuilder.updateDeal(missionId, clientId, clientId, { dealId: id, updates });
                        sendMessage(JSON.stringify(msg));
                      }}
                      onDeleteDeal={(id: string) => {
                        const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                        const msg = SalesAssistantMessageBuilder.deleteDeal(missionId, clientId, clientId, { dealId: id });
                        sendMessage(JSON.stringify(msg));
                      }}
                      sendMessage={sendMessage}
                    />
                  </Box>
                )}
              </Box>
              <Box role="tabpanel" hidden={tabValue !== 1} id="sales-crm-assistant-tabpanel-1" aria-labelledby="sales-crm-assistant-tab-1">
                {tabValue === 1 && (
                  <Box sx={{ p: 3 }}>
                    <LeadManagementDashboard
                      leads={leads}
                      onCreateLead={(lead: Lead) => {
                        const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                        const msg = SalesAssistantMessageBuilder.createLead(missionId, clientId, clientId, { lead });
                        sendMessage(JSON.stringify(msg));
                      }}
                      onUpdateLead={(id: string, updates: Partial<Lead>) => {
                        const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                        const msg = SalesAssistantMessageBuilder.updateLead(missionId, clientId, clientId, { leadId: id, updates });
                        sendMessage(JSON.stringify(msg));
                      }}
                      onDeleteLead={(id: string) => {
                        const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                        const msg = SalesAssistantMessageBuilder.deleteLead(missionId, clientId, clientId, { leadId: id });
                        sendMessage(JSON.stringify(msg));
                      }}
                      sendMessage={sendMessage}
                    />
                  </Box>
                )}
              </Box>
              <Box role="tabpanel" hidden={tabValue !== 2} id="sales-crm-assistant-tabpanel-2" aria-labelledby="sales-crm-assistant-tab-2">
                {tabValue === 2 && (
                  <Box sx={{ p: 3 }}>
                    <Customer360View
                      customers={customers}
                      onUpdateCustomer={(id: string, updates: Partial<Customer>) => {
                        const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                        const msg = SalesAssistantMessageBuilder.updateCustomer(missionId, clientId, clientId, { customerId: id, updates });
                        sendMessage(JSON.stringify(msg));
                      }}
                      onCreateActivity={(activity: SalesActivity) => {
                        const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                        const msg = SalesAssistantMessageBuilder.createActivity(missionId, clientId, clientId, { activity });
                        sendMessage(JSON.stringify(msg));
                      }}
                      sendMessage={sendMessage}
                    />
                  </Box>
                )}
              </Box>
              <Box role="tabpanel" hidden={tabValue !== 3} id="sales-crm-assistant-tabpanel-3" aria-labelledby="sales-crm-assistant-tab-3">
                {tabValue === 3 && (
                  <Box sx={{ p: 3 }}>
                    <ActivityTimeline
                      activities={activities}
                      onCreateActivity={(activity: SalesActivity) => {
                        const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                        const msg = SalesAssistantMessageBuilder.createActivity(missionId, clientId, clientId, { activity });
                        sendMessage(JSON.stringify(msg));
                      }}
                      onUpdateActivity={(id: string, updates: Partial<SalesActivity>) => {
                        const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                        const msg = SalesAssistantMessageBuilder.updateActivity(missionId, clientId, clientId, { activityId: id, updates });
                        sendMessage(JSON.stringify(msg));
                      }}
                      sendMessage={sendMessage}
                    />
                  </Box>
                )}
              </Box>
              <Box role="tabpanel" hidden={tabValue !== 4} id="sales-crm-assistant-tabpanel-4" aria-labelledby="sales-crm-assistant-tab-4">
                {tabValue === 4 && (
                  <Box sx={{ p: 3 }}>
                    <SalesForecastingInterface
                      forecasts={forecasts}
                      onCreateForecast={(forecast: SalesForecast) => {
                        const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                        const msg = SalesAssistantMessageBuilder.createForecast(missionId, clientId, clientId, { forecast });
                        sendMessage(JSON.stringify(msg));
                      }}
                      onUpdateForecast={(id: string, updates: Partial<SalesForecast>) => {
                        const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                        const msg = SalesAssistantMessageBuilder.updateForecast(missionId, clientId, clientId, { forecastId: id, updates });
                        sendMessage(JSON.stringify(msg));
                      }}
                      sendMessage={sendMessage}
                    />
                  </Box>
                )}
              </Box>
              <Box role="tabpanel" hidden={tabValue !== 5} id="sales-crm-assistant-tabpanel-5" aria-labelledby="sales-crm-assistant-tab-5">
                {tabValue === 5 && (
                  <Box sx={{ p: 3 }}>
                    <PerformanceAnalytics
                      metrics={performanceMetrics}
                      sendMessage={sendMessage}
                    />
                  </Box>
                )}
              </Box>
              <Box role="tabpanel" hidden={tabValue !== 6} id="sales-crm-assistant-tabpanel-6" aria-labelledby="sales-crm-assistant-tab-6">
                {tabValue === 6 && (
                  <Box sx={{ p: 3 }}>
                    <ReportingCenter
                      reports={reports}
                      onGenerateReport={(reportType: string) => {
                        const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                        const msg = SalesAssistantMessageBuilder.generateReport(missionId, clientId, clientId, { reportType });
                        sendMessage(JSON.stringify(msg));
                      }}
                      sendMessage={sendMessage}
                    />
                  </Box>
                )}
              </Box>
            </Box>

            {/* Right side for StandardAssistantChat */}
            <Box sx={{ width: '50%', borderLeft: '1px solid #e0e0e0' }}>
              <ChatPanel messages={messages} onSendMessage={sendMessage} isLoading={isLoading} error={error} assistantName="Sales CRM Assistant" enableVoiceInput={true} />
            </Box>
          </Box>
        );
};

// Main component wrapper that uses BaseAssistantPage
const SalesCRMAssistant: React.FC<{ clientId: string }> = ({ clientId }) => {
  return (
    <BaseAssistantPage
      title="Sales CRM Assistant"
      description="Manage your sales pipeline, track deals, analyze performance, and forecast sales. Get help with lead management, customer relationships, and sales strategies."
      client={salesAssistantClient}
      initialPrompt="Hello! I need help managing my sales pipeline and tracking deals."
      clientId={clientId}
    >
      {({ messages, sendMessage, sendEvent, assistantState, getState, isLoading, error, humanInputRequired, submitHumanInput }) => (
        <SalesCRMContent
          messages={messages}
          sendMessage={sendMessage}
          sendEvent={sendEvent}
          assistantState={assistantState}
          getState={getState}
          isLoading={isLoading}
          error={error}
          clientId={clientId}
        />
      )}
    </BaseAssistantPage>
  );
};

export default SalesCRMAssistant;