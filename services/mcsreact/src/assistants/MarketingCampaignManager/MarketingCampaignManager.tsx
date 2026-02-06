import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { BaseAssistantPage } from '../shared/BaseAssistantPage';
import { marketingAssistantClient } from '../shared/assistantClients';
import { MarketingAssistantMessageBuilder } from '../../utils/AssistantMessageBuilders';
import { Tabs, Tab, Box, Typography } from '@mui/material/index.js';
import {
  Campaign,
  ContentItem,
  CalendarEvent,
  PerformanceMetric,
  ROIAnalysis,
  StakeholderReport,
  ApprovalRequest,
  CampaignPlannerData,
  CampaignOverviewToolContent,
  ContentCalendarToolContent,
  PerformanceDashboardToolContent,
  ROIAnalysisToolContent,
  StakeholderReportingToolContent,
  HumanInTheLoopApprovalsToolContent,
  CampaignPlannerToolContent,
  ContentEditorToolContent,
  isCampaignOverviewToolContent,
  isContentCalendarToolContent,
  isPerformanceDashboardToolContent,
  isROIAnalysisToolContent,
  isStakeholderReportingToolContent,
  isHumanInTheLoopApprovalsToolContent,
  isCampaignPlannerToolContent,
  isContentEditorToolContent
} from './types';

import CampaignOverview from './CampaignOverview';
import CampaignPlanner from './CampaignPlanner';
import ContentCalendar from './ContentCalendar';
import ContentEditor from './ContentEditor';
import HumanInTheLoopApprovals from './HumanInTheLoopApprovals';
import PerformanceDashboard from './PerformanceDashboard';
import ROIAnalysisView from './ROIAnalysisView';
import StakeholderReporting from './StakeholderReporting';
import { ChatPanel } from '../../assistants/shared/components/ChatPanel';
import { ConversationMessage } from '@cktmcs/sdk';

// Separate component to hold the state and render logic
const MarketingCampaignManagerContent: React.FC<{
  messages: ConversationMessage[];
  sendMessage: (message: string) => Promise<void>;
  sendEvent: (event: any) => Promise<void>;
  assistantState?: Record<string, any>;
  conversationId?: string;
  isLoading: boolean;
  error: string | null;
  clientId: string;
}> = ({ messages, sendMessage, sendEvent = async () => {}, assistantState = {}, conversationId, isLoading, error, clientId }) => {
    const [tabValue, setTabValue] = useState(0);

    const buildEvent = useCallback((eventType: string, payload: any, entityId?: string) => ({
      type: eventType,
      payload: { ...payload, conversationId },
      entityId: entityId || payload.id || `${eventType}-${Date.now()}`
    }), [conversationId]);

    useEffect(() => {
      if (conversationId) {
        const collections = ['campaign', 'contentItem', 'calendarEvent', 'performanceMetric', 'roiAnalysis', 'stakeholderReport', 'approvalRequest'];
        collections.forEach(collection => {
          sendEvent(buildEvent(`domain.${collection}.load`, { conversationId }));
        });
      }
    }, [conversationId, sendEvent, buildEvent]);

    const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
      setTabValue(newValue);
    };

    const campaigns = useMemo(() => 
      assistantState?.campaign || [],
      [assistantState]
    );

    const calendarData = useMemo(() => {
      const events = assistantState?.calendarEvent || [];
      const items = assistantState?.contentItem || [];
      return { calendarEvents: events, contentItems: items };
    }, [assistantState]);

    const performanceMetrics = useMemo(() => 
      assistantState?.performanceMetric || [],
      [assistantState]
    );

    const roiAnalyses = useMemo(() => 
      assistantState?.roiAnalysis || [],
      [assistantState]
    );

    const stakeholderReports = useMemo(() => 
      assistantState?.stakeholderReport || [],
      [assistantState]
    );

    const approvalRequests = useMemo(() => 
      assistantState?.approvalRequest || [],
      [assistantState]
    );

    const campaignPlannerData = useMemo(() => 
      assistantState?.campaignPlanner || [],
      [assistantState]
    );

    const contentItems = useMemo(() => 
      assistantState?.contentItem || [],
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
                  aria-label="marketing campaign manager features tabs"
                >
                  <Tab label="Campaign Overview" />
                  <Tab label="Campaign Planner" />
                  <Tab label="Content Calendar" />
                  <Tab label="Content Editor" />
                  <Tab label="Performance Dashboard" />
                  <Tab label="ROI Analysis" />
                  <Tab label="Stakeholder Reporting" />
                  <Tab label="Approvals" />
                </Tabs>
              </Box>

              <Box role="tabpanel" hidden={tabValue !== 0} id="marketing-campaign-manager-tabpanel-0" aria-labelledby="marketing-campaign-manager-tab-0">
                {tabValue === 0 && (
                  <Box sx={{ p: 3 }}>
                    <CampaignOverview
                      campaigns={campaigns}
                      onCreateCampaign={(campaign: Campaign) => { 
                        const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                        const msg = MarketingAssistantMessageBuilder.analyzeCampaign(missionId, clientId, clientId, campaign.id, { metricsType: 'all' });
                        sendMessage(JSON.stringify(msg)); 
                      }}
                      onUpdateCampaign={(id: string, updates: Partial<Campaign>) => { 
                        const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                        const msg = MarketingAssistantMessageBuilder.analyzeCampaign(missionId, clientId, clientId, id, { metricsType: 'all', identifyTrends: true });
                        sendMessage(JSON.stringify(msg)); 
                      }}
                      onDeleteCampaign={(id: string) => { 
                        const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                        const msg = MarketingAssistantMessageBuilder.analyzeCampaign(missionId, clientId, clientId, id, { metricsType: 'roi' });
                        sendMessage(JSON.stringify(msg)); 
                      }}
                      sendMessage={sendMessage}
                    />
                  </Box>
                )}
              </Box>
              <Box role="tabpanel" hidden={tabValue !== 1} id="marketing-campaign-manager-tabpanel-1" aria-labelledby="marketing-campaign-manager-tab-1">
                {tabValue === 1 && (
                  <Box sx={{ p: 3 }}>
                    <CampaignPlanner
                      plannerData={campaignPlannerData}
                      onUpdatePlanner={(id: string, updates: Partial<CampaignPlannerData>) => { 
                        const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                        const msg = MarketingAssistantMessageBuilder.analyzeCampaign(missionId, clientId, clientId, id, { metricsType: 'all', identifyTrends: true });
                        sendMessage(JSON.stringify(msg)); 
                      }}
                      sendMessage={sendMessage}
                    />
                  </Box>
                )}
              </Box>
              <Box role="tabpanel" hidden={tabValue !== 2} id="marketing-campaign-manager-tabpanel-2" aria-labelledby="marketing-campaign-manager-tab-2">
                {tabValue === 2 && (
                  <Box sx={{ p: 3 }}>
                    <ContentCalendar
                      calendarEvents={calendarData.calendarEvents}
                      contentItems={calendarData.contentItems}
                      onCreateEvent={(event: CalendarEvent) => { 
                        const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                        const msg = MarketingAssistantMessageBuilder.analyzeCampaign(missionId, clientId, clientId, event.id, { metricsType: 'engagement' });
                        sendMessage(JSON.stringify(msg)); 
                      }}
                      onUpdateEvent={(id: string, updates: Partial<CalendarEvent>) => { 
                        const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                        const msg = MarketingAssistantMessageBuilder.analyzeCampaign(missionId, clientId, clientId, id, { metricsType: 'engagement', identifyTrends: true });
                        sendMessage(JSON.stringify(msg)); 
                      }}
                      sendMessage={sendMessage}
                    />
                  </Box>
                )}
              </Box>
              <Box role="tabpanel" hidden={tabValue !== 3} id="marketing-campaign-manager-tabpanel-3" aria-labelledby="marketing-campaign-manager-tab-3">
                {tabValue === 3 && (
                  <Box sx={{ p: 3 }}>
                    <ContentEditor
                      contentItems={contentItems}
                      onCreateContent={(content: ContentItem) => { 
                        const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                        const msg = MarketingAssistantMessageBuilder.analyzeCampaign(missionId, clientId, clientId, content.id, { metricsType: 'reach' });
                        sendMessage(JSON.stringify(msg)); 
                      }}
                      onUpdateContent={(id: string, updates: Partial<ContentItem>) => { 
                        const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                        const msg = MarketingAssistantMessageBuilder.analyzeCampaign(missionId, clientId, clientId, id, { metricsType: 'engagement', identifyTrends: true });
                        sendMessage(JSON.stringify(msg)); 
                      }}
                      onDeleteContent={(id: string) => { 
                        const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                        const msg = MarketingAssistantMessageBuilder.analyzeCampaign(missionId, clientId, clientId, id, { metricsType: 'all' });
                        sendMessage(JSON.stringify(msg)); 
                      }}
                      sendMessage={sendMessage}
                    />
                  </Box>
                )}
              </Box>
              <Box role="tabpanel" hidden={tabValue !== 4} id="marketing-campaign-manager-tabpanel-4" aria-labelledby="marketing-campaign-manager-tab-4">
                {tabValue === 4 && (
                  <Box sx={{ p: 3 }}>
                    <PerformanceDashboard
                      metrics={performanceMetrics}
                      sendMessage={sendMessage}
                    />
                  </Box>
                )}
              </Box>
              <Box role="tabpanel" hidden={tabValue !== 5} id="marketing-campaign-manager-tabpanel-5" aria-labelledby="marketing-campaign-manager-tab-5">
                {tabValue === 5 && (
                  <Box sx={{ p: 3 }}>
                    <ROIAnalysisView
                      analyses={roiAnalyses}
                      sendMessage={sendMessage}
                    />
                  </Box>
                )}
              </Box>
              <Box role="tabpanel" hidden={tabValue !== 6} id="marketing-campaign-manager-tabpanel-6" aria-labelledby="marketing-campaign-manager-tab-6">
                {tabValue === 6 && (
                  <Box sx={{ p: 3 }}>
                    <StakeholderReporting
                      reports={stakeholderReports}
                      onGenerateReport={(reportType: string) => { 
                        const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                        const campaigns = (roiAnalyses.length > 0 ? roiAnalyses[0].campaignId : 'default-campaign');
                        const msg = MarketingAssistantMessageBuilder.analyzeCampaign(missionId, clientId, clientId, campaigns, { metricsType: 'all' });
                        sendMessage(JSON.stringify(msg)); 
                      }}
                      sendMessage={sendMessage}
                    />
                  </Box>
                )}
              </Box>
              <Box role="tabpanel" hidden={tabValue !== 7} id="marketing-campaign-manager-tabpanel-7" aria-labelledby="marketing-campaign-manager-tab-7">
                {tabValue === 7 && (
                  <Box sx={{ p: 3 }}>
                    <HumanInTheLoopApprovals
                      approvalRequests={approvalRequests}
                      onApproveRequest={(id: string) => { 
                        const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                        const campaigns = (roiAnalyses.length > 0 ? roiAnalyses[0].campaignId : 'default-campaign');
                        const msg = MarketingAssistantMessageBuilder.analyzeCampaign(missionId, clientId, clientId, campaigns, { metricsType: 'roi' });
                        sendMessage(JSON.stringify(msg)); 
                      }}
                      onRejectRequest={(id: string, reason: string) => { 
                        const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                        const campaigns = (roiAnalyses.length > 0 ? roiAnalyses[0].campaignId : 'default-campaign');
                        const msg = MarketingAssistantMessageBuilder.analyzeCampaign(missionId, clientId, clientId, campaigns, { metricsType: 'all' });
                        sendMessage(JSON.stringify(msg)); 
                      }}
                      onRequestChanges={(id: string, changes: string) => { 
                        const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                        const campaigns = (roiAnalyses.length > 0 ? roiAnalyses[0].campaignId : 'default-campaign');
                        const msg = MarketingAssistantMessageBuilder.analyzeCampaign(missionId, clientId, clientId, campaigns, { metricsType: 'all', identifyTrends: true });
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
              <ChatPanel messages={messages} onSendMessage={sendMessage} isLoading={isLoading} error={error} assistantName="Marketing Campaign Manager" enableVoiceInput={true} />
            </Box>
          </Box>
        );
};

// Main component wrapper that uses BaseAssistantPage
const MarketingCampaignManager: React.FC<{ clientId: string }> = ({ clientId }) => {
  return (
    <BaseAssistantPage
      title="Marketing Campaign Manager"
      description="Plan, manage, and optimize marketing campaigns with AI assistance."
      client={marketingAssistantClient}
      initialPrompt="Hello! I'm ready to help you create and manage your marketing campaign."
      clientId={clientId}
    >
      {({ messages, sendMessage, sendEvent, assistantState, getState, mergeAssistantState, isLoading, error, humanInputRequired, submitHumanInput }) => (
        <MarketingCampaignManagerContent
          messages={messages}
          sendMessage={sendMessage}
          sendEvent={sendEvent}
          assistantState={assistantState}
          isLoading={isLoading}
          error={error}
          clientId={clientId}
        />
      )}
    </BaseAssistantPage>
  );
};

export default MarketingCampaignManager;



