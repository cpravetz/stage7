import React, { useEffect, useCallback, useMemo, useState } from 'react';
import { BaseAssistantPage } from '../shared/BaseAssistantPage';
import { ConversationMessage } from '@cktmcs/sdk';
import { Box, Typography, useTheme, useMediaQuery, Tabs, Tab, IconButton } from '@mui/material';
import { Menu as MenuIcon, Close as CloseIcon } from '@mui/icons-material';

// Import existing components
import ContentIdeationHub from './components/ContentIdeationHub';
import MultiPlatformContentEditor from './components/MultiPlatformContentEditor';
import ContentCalendar from './components/ContentCalendar';
import SEOOptimizationPanel from './components/SEOOptimizationPanel';
import PerformanceDashboard from './components/PerformanceDashboard';
import ContentLibrary from './components/ContentLibrary';
import AudienceInsightsView from './components/AudienceInsightsView';
import CrossPlatformPublishing from './components/CrossPlatformPublishing';
import { ContentPiece } from './types';
import { ChatPanel } from '../../assistants/shared/components/ChatPanel';
import { ContentCreatorAssistantClient } from './ContentCreatorAssistantClient';
import { API_BASE_URL, WS_URL } from '../../config';

const contentCreatorAssistantClient = new ContentCreatorAssistantClient(
  `${API_BASE_URL}/api/content-creator-assistant`,
  `${WS_URL}/ws/content-creator-assistant/conversations`
)

interface AssistantRenderProps {
    messages: ConversationMessage[];
    sendMessage: (message: string) => Promise<void>;
    sendEvent: (event: any) => Promise<void>;
    isLoading: boolean;
    error: string | null;
    humanInputRequired: { prompt: string; type: string; metadata: any; inputStepId: string; } | null;
    submitHumanInput: (response: string, inputStepId: string) => void;
    conversationId: string;
    assistantState: any;
    getState: (collectionName: string) => any[];
    mergeAssistantState: (collection: string, items: any[]) => void;
}

const ContentCreatorCoachAssistantPageView: React.FC<AssistantRenderProps> = ({ 
  messages, sendMessage, sendEvent, isLoading, error,
  conversationId, assistantState, getState = () => []
}) => {
    const [activeTab, setActiveTab] = React.useState(0);
    const [leftPanelOpen, setLeftPanelOpen] = React.useState(true);
    const [rightPanelOpen, setRightPanelOpen] = React.useState(true);
  const [contentToEdit, setContentToEdit] = useState<ContentPiece | null>(null);

    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const toggleLeftPanel = () => setLeftPanelOpen(!leftPanelOpen);
    const toggleRightPanel = () => setRightPanelOpen(!rightPanelOpen);

    const buildEvent = useCallback((eventType: string, payload: any, entityId?: string) => ({
      type: eventType,
      payload: { ...payload, conversationId },
      entityId: entityId || 'content-' + Date.now()
    }), [conversationId]);

    useEffect(() => {
      getState('contentGoal');
      getState('contentPiece');
      getState('platformPerformance');
      getState('audienceDemographics');
      getState('audienceInterests');
      getState('scheduledContent');
      getState('approvalRequest');
      getState('seoMetrics');
      getState('seoSuggestion');
      getState('trendingTopic');
    }, [getState]);

    const contentGoals = useMemo(() => getState('contentGoal') || [], [assistantState, getState]);
    const contentPieces = useMemo(() => getState('contentPiece') || [], [assistantState, getState]);
    const performanceData = useMemo(() => getState('platformPerformance') || [], [assistantState, getState]);
    const audienceDemographics = useMemo(() => getState('audienceDemographics') || [], [assistantState, getState]);
    const audienceInterests = useMemo(() => getState('audienceInterests') || [], [assistantState, getState]);
    const scheduledContent = useMemo(() => getState('scheduledContent') || [], [assistantState, getState]);
    const seoMetrics = useMemo(() => getState('seoMetrics') || [], [assistantState, getState]);
    const seoSuggestions = useMemo(() => getState('seoSuggestion') || [], [assistantState, getState]);
    const trendingTopics = useMemo(() => getState('trendingTopic') || [], [assistantState, getState]);
    const targetAudience = useMemo(() => (getState('targetAudience') || [])[0] || null, [assistantState, getState]);

    const publishOptions = useMemo(() => {
      const platforms = new Set<string>();
      contentPieces.forEach((piece) => platforms.add(piece.platform));
      const fallback = ['Social Media', 'Email', 'Blog', 'Video'];
      const list = platforms.size ? Array.from(platforms) : fallback;
      return list.map((name, index) => ({ id: `${name}-${index}`, name, enabled: true }));
    }, [contentPieces]);

    return (
        <Box sx={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
            {/* Left Panel - Content Creator Tools */}
            {(leftPanelOpen || !isMobile) && (
              <Box sx={{
                width: leftPanelOpen ? { xs: '100%', md: 350 } : 0,
                transition: 'width 0.3s ease',
                overflow: 'hidden',
                display: { xs: leftPanelOpen ? 'block' : 'none', md: 'block' },
                height: '100vh',
                borderRight: '1px solid #e0e0e0',
                overflowY: 'auto'
              }}>
                <Box sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom>
                    Content Tools
                  </Typography>

                  <Tabs
                    value={activeTab}
                    onChange={(e, newValue) => setActiveTab(newValue)}
                    orientation="vertical"
                    variant="scrollable"
                    sx={{ borderRight: 1, borderColor: 'divider' }}
                  >
                    <Tab label="Content Ideas" />
                    <Tab label="Editor" />
                    <Tab label="Calendar" />
                    <Tab label="SEO" />
                    <Tab label="Performance" />
                    <Tab label="Library" />
                    <Tab label="Audience" />
                    <Tab label="Publishing" />
                  </Tabs>
                </Box>
              </Box>
            )}

            {/* Main Content Area */}
            <Box sx={{
              flexGrow: 1,
              display: 'flex',
              flexDirection: 'column',
              height: '100vh',
              overflow: 'hidden'
            }}>
              {/* Header */}
              <Box sx={{
                p: 2,
                borderBottom: '1px solid #e0e0e0',
                backgroundColor: theme.palette.background.paper,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <Typography variant="h5" fontWeight="bold">
                  Content Creator Coach
                </Typography>
                <Box>
                  {!isMobile && (
                    <IconButton onClick={toggleLeftPanel} sx={{ mr: 1 }}>
                      {leftPanelOpen ? <CloseIcon fontSize="small" /> : <MenuIcon fontSize="small" />}
                    </IconButton>
                  )}
                  <IconButton onClick={toggleRightPanel}>
                    {rightPanelOpen ? <CloseIcon fontSize="small" /> : <MenuIcon fontSize="small" />}
                  </IconButton>
                </Box>
              </Box>

              {/* Chat Area */}
              <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
                <ChatPanel messages={messages} onSendMessage={sendMessage} isLoading={isLoading} error={error} assistantName="Content Creator Coach" enableVoiceInput={true} />
              </Box>
            </Box>

            {/* Right Panel - Active Tool Content */}
            {(rightPanelOpen || !isMobile) && (
              <Box sx={{
                width: rightPanelOpen ? { xs: '100%', md: 400 } : 0,
                transition: 'width 0.3s ease',
                overflow: 'hidden',
                display: { xs: rightPanelOpen ? 'block' : 'none', md: 'block' },
                height: '100vh',
                borderLeft: '1px solid #e0e0e0',
                overflowY: 'auto',
                p: 2
              }}>
                {activeTab === 0 && (
                  <ContentIdeationHub
                    onGenerateIdeas={(goals, audience) => {
                      sendEvent(buildEvent('domain.contentIdea.generate', { goals, audience }));
                    }}
                    onAnalyzeTrends={(goals, audience) => {
                      sendEvent(buildEvent('domain.trends.analyze', { goals, audience }));
                    }}
                    conversationId={conversationId}
                    contentGoals={contentGoals}
                    targetAudience={targetAudience}
                    trendingTopics={trendingTopics}
                    onAddContentGoal={(goal) => {
                      sendEvent(buildEvent('domain.contentGoal.add', { goal }));
                    }}
                    onRemoveContentGoal={(index) => {
                      sendEvent(buildEvent('domain.contentGoal.remove', { index }));
                    }}
                    onSetTargetAudience={(audience) => {
                      sendEvent(buildEvent('domain.targetAudience.set', { audience }));
                    }}
                  />
                )}
                {activeTab === 1 && (
                  <MultiPlatformContentEditor
                    contentToEdit={contentToEdit}
                    onSave={(content) => {
                      sendEvent(buildEvent('domain.contentPiece.save', { content }));
                      setContentToEdit(null);
                    }}
                    onCancel={() => setContentToEdit(null)}
                  />
                )}
                {activeTab === 2 && <ContentCalendar scheduledContent={scheduledContent} />}
                {activeTab === 3 && (
                  <SEOOptimizationPanel
                    conversationId={conversationId}
                    seoMetrics={seoMetrics}
                    seoSuggestions={seoSuggestions}
                  />
                )}
                {activeTab === 4 && <PerformanceDashboard performanceData={performanceData} />}
                {activeTab === 5 && (
                  <ContentLibrary
                    contentPieces={contentPieces}
                    onEditContent={(content) => setContentToEdit(content)}
                    onDeleteContent={(id) => {
                      sendEvent(buildEvent('domain.contentPiece.delete', { id }));
                    }}
                  />
                )}
                {activeTab === 6 && (
                  <AudienceInsightsView
                    audienceDemographics={audienceDemographics}
                    audienceInterests={audienceInterests}
                  />
                )}
                {activeTab === 7 && (
                  <CrossPlatformPublishing
                    publishOptions={publishOptions}
                    onPublish={(platforms) => {
                      sendEvent(buildEvent('domain.content.publish', { platforms }));
                    }}
                  />
                )}
              </Box>
            )}
          </Box>
    );
};

export const ContentCreatorCoachAssistantPage: React.FC<{ clientId: string }> = ({ clientId }) => {
  return (
    <BaseAssistantPage
      title="Content Creator Coach"
      description="Create and manage multi-platform content with AI-powered ideation, optimization, scheduling, and performance analytics."
      client={contentCreatorAssistantClient}
      initialPrompt="Hello! I need help creating and managing my content strategy."
      clientId={clientId}
    >
      {(props) => <ContentCreatorCoachAssistantPageView {...props} />}
    </BaseAssistantPage>
  );
};

export default ContentCreatorCoachAssistantPage;
