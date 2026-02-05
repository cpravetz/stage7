import React, { useState, useCallback, useEffect } from 'react';
import { BaseAssistantPage } from '../shared/BaseAssistantPage';
import { ContentCreatorAssistantClient } from './ContentCreatorAssistantClient';
import { ConversationMessage } from '@cktmcs/sdk';
import { ScheduledContent, ApprovalRequest, TrendingTopic, PlatformPerformance, AudienceDemographics, AudienceInterests, SeoMetrics, SeoSuggestion } from './types';
import { Typography, Box, IconButton, useTheme, useMediaQuery, Tabs, Tab, Grid } from '@mui/material';
import { Menu as MenuIcon, Close as CloseIcon, Lightbulb as LightbulbIcon, Edit as EditIcon, CalendarToday as CalendarTodayIcon, Search as SearchIcon, BarChart as BarChartIcon, People as PeopleIcon, LibraryBooks as LibraryBooksIcon, Publish as PublishIcon, PolicyOutlined as PolicyOutlinedIcon } from '@mui/icons-material';
import { API_BASE_URL, WS_URL } from '../../config';

import ContentIdeationHub from './components/ContentIdeationHub';
import MultiPlatformContentEditor from './components/MultiPlatformContentEditor';
import ContentCalendar from './components/ContentCalendar';
import SEOOptimizationPanel from './components/SEOOptimizationPanel';
import PerformanceDashboard from './components/PerformanceDashboard';
import ContentLibrary from './components/ContentLibrary';
import AudienceInsightsView from './components/AudienceInsightsView';
import CrossPlatformPublishing from './components/CrossPlatformPublishing';
import HumanInTheLoopComponents from './HumanInTheLoopComponents';
import { ChatPanel } from '../../assistants/shared/components/ChatPanel';
import { ContentGoal, TargetAudience, ContentPiece, EngagementPatterns } from './types';

export const contentCreatorAssistantClient = new ContentCreatorAssistantClient(
    `${API_BASE_URL}/api/content-creator-assistant`,
    `${WS_URL}/ws/content-creator-assistant/conversations`
  );

// --- ContentCreatorAssistantPageView Component ---
interface AssistantRenderProps {
    messages: ConversationMessage[];
    sendMessage: (message: string) => void;
    isLoading: boolean;
    error: string | null;
    humanInputRequired: { prompt: string; type: string; metadata: any; inputStepId: string } | null;
    submitHumanInput: (response: string, inputStepId: string) => void;
      sendEvent?: (event: any) => Promise<void>;
}

const ContentCreatorAssistantPageView: React.FC<AssistantRenderProps> = ({ messages, sendMessage, isLoading, error, humanInputRequired, submitHumanInput }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  
  // State for ContentIdeationHub
  const [contentGoals, setContentGoals] = useState<ContentGoal[]>([]);
  const [targetAudience, setTargetAudience] = useState<TargetAudience | null>(null);
  const [trendingTopics, setTrendingTopics] = useState<TrendingTopic[]>([]);
  const [contentPieces, setContentPieces] = useState<ContentPiece[]>([]);
  const [selectedContentPiece, setSelectedContentPiece] = useState<ContentPiece | null>(null);
  const [performanceData, setPerformanceData] = useState<PlatformPerformance[]>([]);
  const [audienceDemographics, setAudienceDemographics] = useState<AudienceDemographics[]>([]);
  const [audienceInterests, setAudienceInterests] = useState<AudienceInterests[]>([]);
  const [scheduledContent, setScheduledContent] = useState<ScheduledContent[]>([]);
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([]);
  const [seoMetrics, setSeoMetrics] = useState<SeoMetrics[]>([]);
  const [seoSuggestions, setSeoSuggestions] = useState<SeoSuggestion[]>([]);
 
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
 
  const toggleLeftPanel = () => setLeftPanelOpen(!leftPanelOpen);
  const toggleRightPanel = () => setRightPanelOpen(!rightPanelOpen);
 
  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  // --- Data Extraction from Messages ---
  const extractLatestToolOutput = useCallback(<T,>(toolName: string, msgList: ConversationMessage[]): T | null => {
    const relevantMessages = msgList.filter(
      (msg) => msg.sender === 'tool' && (msg.content as any)?.tool === toolName
    );
    if (relevantMessages.length > 0) {
      return (relevantMessages[relevantMessages.length - 1].content as any) as T;
    }
    return null;
  }, []);

  const getTrendingTopicsFromMessages = useCallback((msgList: ConversationMessage[]) => {
    const trendingTopicMessages = msgList.filter(
      (msg) => {
        const content = msg.content;
        const hasToolAndTopics = (
          typeof content === 'object' &&
          content !== null &&
          'tool' in content &&
          (content as any).tool === 'TrendAnalysisTool' &&
          'topics' in content
        );
        return msg.sender === 'tool' && hasToolAndTopics;
      }
    );
    if (trendingTopicMessages.length > 0) {
      const latestMessage = trendingTopicMessages[trendingTopicMessages.length - 1];
      const content = latestMessage.content;
      if (typeof content === 'object' && content !== null && 'topics' in content) {
        return (content as any).topics.map((topic: any) => ({
          id: topic.topic,
          topic: topic.topic,
          popularity: topic.relevance,
          growth: 0,
        })) as TrendingTopic[];
      }
    }
    return [];
  }, []);

  const getAudienceInsightsFromMessages = useCallback((msgList: ConversationMessage[]) => {
    let demographics: AudienceDemographics[] = [];
    let interests: AudienceInterests[] = [];
    let engagementPatterns: EngagementPatterns[] = [];
  
    const audienceInsightMessages = msgList.filter(
      (msg) => {
        const content = msg.content;
        const hasToolAndInsights = (
          typeof content === 'object' &&
          content !== null &&
          'tool' in content &&
          ((content as any).tool === 'AudienceInsightsTool' || (content as any).tool === 'AnalyticsTool') &&
          ('insights' in content || 'patterns' in content)
        );
        return msg.sender === 'tool' && hasToolAndInsights;
      }
    );
  
    audienceInsightMessages.forEach((msg) => {
      const content = msg.content as any;
      if (content.tool === 'AnalyticsTool' && content.insights) {
        if (content.insights.demographics) {
          demographics.push({
            id: 'demographics-' + content.audienceSegment,
            ageRange: content.insights.demographics.age,
            gender: content.insights.demographics.gender,
            location: 'N/A',
            percentage: 100,
          });
        }
        if (content.insights.interests) {
          interests.push(...content.insights.interests.map((interest: string) => ({
            id: interest,
            interest: interest,
            popularity: 0,
          })));
        }
      }
      if (content.tool === 'AudienceInsightsTool' && content.patterns) {
        engagementPatterns.push(...content.patterns.map((pattern: string) => ({
          id: pattern,
          pattern: pattern,
          time: 'N/A',
          frequency: 0,
        })));
      }
    });
  
    return { demographics, interests, engagementPatterns };
  }, []);

  const getPerformanceDataFromMessages = useCallback((msgList: ConversationMessage[]) => {
    const performanceMessages = msgList.filter(
      (msg) => {
        const content = msg.content;
        const hasToolAndMetrics = (
          typeof content === 'object' &&
          content !== null &&
          'tool' in content &&
          ((content as any).tool === 'AnalyticsTool' || (content as any).tool === 'SocialMediaTool' || (content as any).tool === 'VideoPlatformTool') &&
          ('metrics' in content || 'performance' in content)
        );
        return msg.sender === 'tool' && hasToolAndMetrics;
      }
    );
  
    let performance: PlatformPerformance[] = [];
    performanceMessages.forEach((msg) => {
      const content = msg.content as any;
      if (content.tool === 'AnalyticsTool' && content.metrics) {
        performance.push(...content.metrics.map((m: any) => ({
          id: m.platform,
          platform: m.platform,
          engagement: m.likes + m.shares + m.comments,
          reach: 0,
          growth: 0,
        })));
      } else if (content.tool === 'SocialMediaTool' && content.metrics) {
        performance.push({
          id: content.platform,
          platform: content.platform,
          engagement: content.metrics.likes + content.metrics.shares + content.metrics.comments,
          reach: 0,
          growth: 0,
        });
      } else if (content.tool === 'VideoPlatformTool' && content.performance) {
        performance.push({
          id: content.videoId,
          platform: 'Video',
          engagement: content.performance.likes + content.performance.comments,
          reach: content.performance.views,
          growth: 0,
        });
      }
    });
    return performance;
  }, []);

  const getSeoDataFromMessages = useCallback((msgList: ConversationMessage[]) => {
    let metrics: SeoMetrics[] = [];
    let suggestions: SeoSuggestion[] = [];
  
    const seoMessages = msgList.filter(
      (msg) => {
        const content = msg.content;
        const hasToolAndSeoData = (
          typeof content === 'object' &&
          content !== null &&
          'tool' in content &&
          (content as any).tool === 'SEOTool' &&
          ('performance' in content || 'keywords' in content)
        );
        return msg.sender === 'tool' && hasToolAndSeoData;
      }
    );
  
    seoMessages.forEach((msg) => {
      const content = msg.content as any;
      if (content.performance) {
        metrics.push(...content.performance.map((p: any) => ({
          id: p.keyword,
          keyword: p.keyword,
          ranking: 0,
          searchVolume: 0,
          difficulty: p.performance,
        })));
      }
      if (content.keywords) {
        suggestions.push(...content.keywords.map((kw: string) => ({
          id: kw,
          suggestion: kw,
          impact: 'Medium',
          difficulty: 'Medium',
        })));
      }
    });
    return { metrics, suggestions };
  }, []);

  const getcontentPiecesFromMessages = useCallback((msgList: ConversationMessage[]) => {
    const contentPieceMessages = msgList.filter(
      (msg) => {
        const content = msg.content;
        const hasToolAndContentPieces = (
          typeof content === 'object' &&
          content !== null &&
          'tool' in content &&
          'contentPieces' in content
        );
        return msg.sender === 'tool' && hasToolAndContentPieces &&
               (content as any).tool === 'ContentLibraryTool' && (content as any).contentPieces;
      }
    );
    if (contentPieceMessages.length > 0) {
      const latestContentPieceMessage = contentPieceMessages[contentPieceMessages.length - 1];
      const content = latestContentPieceMessage.content;
      if (typeof content === 'object' && content !== null &&
          'contentPieces' in content) {
        return (content as any).contentPieces as ContentPiece[];
      }
    }
    return [];
  }, []);

  // Update state based on messages (tool outputs)
  useEffect(() => {
    setTrendingTopics(getTrendingTopicsFromMessages(messages));
    const { demographics, interests, engagementPatterns } = getAudienceInsightsFromMessages(messages);
    setAudienceDemographics(demographics);
    setAudienceInterests(interests);
    setPerformanceData(getPerformanceDataFromMessages(messages));
    const { metrics, suggestions } = getSeoDataFromMessages(messages);
    setSeoMetrics(metrics);
    setSeoSuggestions(suggestions);
    setContentPieces(getcontentPiecesFromMessages(messages));

    // Fetch scheduled content and approval requests
    if (messages.length > 0 && messages[messages.length - 1].metadata?.conversationId) {
      const currentConversationId = messages[messages.length - 1].metadata?.conversationId;
      const fetchScheduledContent = async () => {
        try {
          const data = await contentCreatorAssistantClient.getScheduledContent(currentConversationId);
          setScheduledContent(data);
        } catch (err) {
          console.error('Error fetching scheduled content:', err);
        }
      };
      fetchScheduledContent();

      const fetchApprovalRequests = async () => {
        try {
          const data = await contentCreatorAssistantClient.getApprovalRequests(currentConversationId);
          setApprovalRequests(data);
        } catch (err) {
          console.error('Error fetching approval requests:', err);
        }
      };
      fetchApprovalRequests();
    }
  }, [messages, getTrendingTopicsFromMessages, getAudienceInsightsFromMessages,
      getPerformanceDataFromMessages, getSeoDataFromMessages, getcontentPiecesFromMessages]);


  // Handlers for ContentIdeationHub
  const handleGenerateIdeas = (goals: ContentGoal[], audience: TargetAudience | null) => {
    const goalText = goals.map(g => g.goal).join(', ');
    const audienceText = audience ? audience.audience : 'a general audience';
    const prompt = `Generate content ideas based on the following goals: [${goalText}] for the target audience: [${audienceText}].`;
    sendMessage(prompt);
  };

  const handleAnalyzeTrends = (goals: ContentGoal[], audience: TargetAudience | null) => {
    const goalText = goals.map(g => g.goal).join(', ');
    const audienceText = audience ? audience.audience : 'a general audience';
    const prompt = `Analyze current trends for content with these goals: [${goalText}] and this target audience: [${audienceText}].`;
    sendMessage(prompt);
  };

  const handleAddContentGoal = (goal: string) => {
    setContentGoals([...contentGoals, { id: Date.now().toString(), goal }]);
  };

  const handleRemoveContentGoal = (index: number) => {
    setContentGoals(contentGoals.filter((_, i) => i !== index));
  };

  const handleSetTargetAudience = (audience: string) => {
    setTargetAudience({ id: Date.now().toString(), audience });
  };

  const handleEditContent = (content: ContentPiece) => {
    setSelectedContentPiece(content);
    setActiveTab(1); // Switch to Content Editor tab
  };

  const handleSaveContent = (updatedContent: ContentPiece) => {
    setContentPieces((prev) =>
      prev.map((cp) => (cp.id === updatedContent.id ? updatedContent : cp))
    );
    setSelectedContentPiece(null);
    setActiveTab(5); // Switch back to Content Library tab
    // Optionally, send update to backend via client.sendMessage
  };

  const handleDeleteContent = (id: string) => {
    setContentPieces((prev) => prev.filter((cp) => cp.id !== id));
    // Optionally, send delete request to backend via client.sendMessage
    console.log(`Content piece ${id} deleted locally.`);
  };

  const handleCancelContent = () => {
    setSelectedContentPiece(null);
    setActiveTab(5); // Switch back to Content Library tab
  };


  return (
    <Box sx={{
      display: 'flex',
      height: '100%',
      width: '100%'
    }}>
      {/* Left Panel - Content Creation Tools */}
      {(leftPanelOpen || !isMobile) && (
        <Box sx={{
          width: leftPanelOpen ? { xs: '100%', md: 350 } : 0,
          transition: 'width 0.3s ease',
          overflow: 'hidden',
          display: { xs: leftPanelOpen ? 'block' : 'none', md: 'block' },
          height: '100%',
          borderRight: '1px solid #e0e0e0',
          overflowY: 'auto'
        }}>
          <Box sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Content Creation Tools
            </Typography>

            <Tabs
              value={activeTab}
              onChange={handleTabChange}
              orientation="vertical"
              variant="scrollable"
              sx={{ borderRight: 1, borderColor: 'divider' }}
              aria-label="career assistant features tabs"
            >
              <Tab label="Content Ideation" icon={<LightbulbIcon />} iconPosition="start" />
              <Tab label="Content Editor" icon={<EditIcon />} iconPosition="start" />
              <Tab label="Content Calendar" icon={<CalendarTodayIcon />} iconPosition="start" />
              <Tab label="SEO Optimization" icon={<SearchIcon />} iconPosition="start" />
              <Tab label="Performance Dashboard" icon={<BarChartIcon />} iconPosition="start" />
              <Tab label="Content Library" icon={<LibraryBooksIcon />} iconPosition="start" />
              <Tab label="Audience Insights" icon={<PeopleIcon />} iconPosition="start" />
              <Tab label="Cross-Platform Publishing" icon={<PublishIcon />} iconPosition="start" />
              <Tab label="Human-in-the-Loop" icon={<PolicyOutlinedIcon />} iconPosition="start" />
            </Tabs>
          </Box>
        </Box>
      )}

      {/* Main Content Area */}
      <Box sx={{
        flexGrow: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden'
      }}>
        {/* Header with Title and Panel Toggles */}
        <Box sx={{
          p: 2,
          borderBottom: '1px solid #e0e0e0',
          backgroundColor: theme.palette.background.paper,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <Typography variant="h5" fontWeight="bold">
            Content Creator Assistant
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
        <ChatPanel messages={messages} onSendMessage={sendMessage} isLoading={isLoading} error={error} assistantName="Content Creator Assistant" enableVoiceInput={true} />
      </Box>

      {/* Right Panel - Active Tool Content */}
      {(rightPanelOpen || !isMobile) && (
        <Box sx={{
          width: rightPanelOpen ? { xs: '100%', md: 400 } : 0,
          transition: 'width 0.3s ease',
          overflow: 'hidden',
          display: { xs: rightPanelOpen ? 'block' : 'none', md: 'block' },
          height: '100%',
          borderLeft: '1px solid #e0e0e0',
          overflowY: 'auto',
          p: 2
        }}>
          {activeTab === 0 && <ContentIdeationHub
            onGenerateIdeas={() => handleGenerateIdeas(contentGoals, targetAudience)}
            onAnalyzeTrends={() => handleAnalyzeTrends(contentGoals, targetAudience)}
            conversationId={messages.length > 0 ? messages[messages.length - 1].metadata?.conversationId : undefined}
            contentGoals={contentGoals}
            targetAudience={targetAudience}
            trendingTopics={trendingTopics}
            onAddContentGoal={handleAddContentGoal}
            onRemoveContentGoal={handleRemoveContentGoal}
            onSetTargetAudience={handleSetTargetAudience}
          />}
          {activeTab === 1 && <MultiPlatformContentEditor
            contentToEdit={selectedContentPiece}
            onSave={handleSaveContent}
            onCancel={handleCancelContent}
          />}
          {activeTab === 2 && <ContentCalendar scheduledContent={scheduledContent} />}
          {activeTab === 3 && <SEOOptimizationPanel conversationId={messages.length > 0 ? messages[messages.length - 1].metadata?.conversationId : undefined} seoMetrics={seoMetrics} seoSuggestions={seoSuggestions} />}
          {activeTab === 4 && <PerformanceDashboard performanceData={performanceData} />}
          {activeTab === 5 && <ContentLibrary contentPieces={contentPieces} onEditContent={handleEditContent} onDeleteContent={handleDeleteContent} />}
          {activeTab === 6 && <AudienceInsightsView audienceDemographics={audienceDemographics} audienceInterests={audienceInterests} />}
          {activeTab === 7 && <CrossPlatformPublishing publishOptions={[]} onPublish={() => {}} />}
          {activeTab === 8 && <HumanInTheLoopComponents
            conversationId={messages.length > 0 ? messages[messages.length - 1].metadata?.conversationId : undefined}
            client={contentCreatorAssistantClient}
            setError={(message) => console.error(message)}
          />}
        </Box>
      )}
    </Box>
  );
};

export const ContentCreatorAssistantPage: React.FC<{ clientId: string }> = ({ clientId }) => {
  return (
    <BaseAssistantPage
      title="Content Creator Assistant"
      description="Your AI partner for content creation and management."
      client={contentCreatorAssistantClient}
      initialPrompt="Hello! I need help creating and managing content."
      clientId={clientId}
    >
      {(props) => <ContentCreatorAssistantPageView {...props} />}
    </BaseAssistantPage>
  );
};

export default ContentCreatorAssistantPage;


