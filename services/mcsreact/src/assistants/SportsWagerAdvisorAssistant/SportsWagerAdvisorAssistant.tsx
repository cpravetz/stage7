import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { BaseAssistantPage } from '../shared/BaseAssistantPage';
import { financeAssistantClient } from '../shared/assistantClients';
import { Tabs, Tab, Box } from '@mui/material/index.js';
import { ConversationMessage } from '@cktmcs/sdk';
import { SportsBettingAssistantMessageBuilder } from '../../utils/AssistantMessageBuilders';

import OddsAnalysisHub from './OddsAnalysisHub';
import BettingStrategyCenter from './BettingStrategyCenter';
import BankrollManagementCenter from './BankrollManagementCenter';
import PerformanceTrackingDashboard from './PerformanceTrackingDashboard';
import LiveBettingConsole from './LiveBettingConsole';
import SportsAnalyticsStudio from './SportsAnalyticsStudio';
import ResponsibleGamblingCenter from './ResponsibleGamblingCenter';
import AlertSystem from './AlertSystem';
import { ChatPanel } from '../../assistants/shared/components/ChatPanel';
import { Strategy, Game, Wager } from './types';

// Data types for sports wager advisor
interface OddsData {
  id: string;
  games: Game[];
}

interface PerformanceData {
  id: string;
  totalWagers: number;
  wins: number;
  losses: number;
  wagerHistory: Wager[];
}

interface AnalyticsInsight {
  id: string;
  sport: string;
  insight: string;
  confidence: number;
}

interface AlertNotification {
  id: string;
  type: 'warning' | 'info' | 'success';
  message: string;
  timestamp: string;
}

interface AssistantRenderProps {
    messages: ConversationMessage[];
    sendMessage: (message: string) => Promise<void>;
    sendEvent: (event: any) => Promise<void>;
    assistantState?: Record<string, any>;
    getState: (collectionName: string) => any[];
    mergeAssistantState?: (updates: Record<string, any>) => void;
    conversationId?: string;
    isLoading: boolean;
    error: string | null;
    humanInputRequired: { prompt: string; type: string; metadata: any; inputStepId: string; } | null;
    submitHumanInput: (response: string, inputStepId: string) => void;
    clientId: string;
}

// Separate component to hold the state and render logic
const SportsWagerAdvisorContent: React.FC<{
  messages: ConversationMessage[];
  sendMessage: (message: string) => Promise<void>;
  sendEvent?: (event: any) => Promise<void>;
  assistantState?: Record<string, any>;
  conversationId?: string;
  isLoading: boolean;
  error: string | null;
  clientId: string;
}> = ({
    messages, sendMessage, sendEvent = async () => {}, assistantState = {}, conversationId, isLoading, error, clientId
  }) => {
    const [tabValue, setTabValue] = useState(0);

    const buildEvent = useCallback((eventType: string, payload: any, entityId?: string) => ({
        type: eventType,
        payload: { ...payload, conversationId },
        entityId: entityId || payload.id || `${eventType}-${Date.now()}`
    }), [conversationId]);

    useEffect(() => {
      if (conversationId) {
        const collections = ['strategy', 'game', 'wager', 'analyticsInsight', 'alert'];
        collections.forEach(collection => {
          sendEvent(buildEvent(`domain.${collection}.load`, { conversationId }));
        });
      }
    }, [conversationId, sendEvent, buildEvent]);

    const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
        setTabValue(newValue);
    };

    const strategies = useMemo(() => 
      assistantState?.strategy || [],
      [assistantState]
    );

    const games = useMemo(() => 
      assistantState?.game || [],
      [assistantState]
    );

    const wagers = useMemo(() => 
      assistantState?.wager || [],
      [assistantState]
    );

    const analyticsInsights = useMemo(() => 
      assistantState?.analyticsInsight || [],
      [assistantState]
    );

    const alerts = useMemo(() => 
      assistantState?.alert || [],
      [assistantState]
    );

    return (
        <Box sx={{ display: 'flex', height: '100%', width: '100%' }}>
            <Box sx={{ flexGrow: 1, overflowY: 'auto', width: '50%' }}>
                <Box component="div" sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs
                        value={tabValue}
                        onChange={handleTabChange}
                        indicatorColor="primary"
                        textColor="primary"
                        variant="scrollable"
                        scrollButtons="auto"
                        aria-label="sports wager advisor features tabs"
                    >
                        <Tab label="Odds Analysis" />
                        <Tab label="Betting Strategy" />
                        <Tab label="Bankroll Management" />
                        <Tab label="Performance Tracking" />
                        <Tab label="Live Betting" />
                        <Tab label="Sports Analytics" />
                        <Tab label="Responsible Gambling" />
                        <Tab label="Alerts" />
                    </Tabs>
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 0}>
                    {tabValue === 0 && (
                        <Box sx={{ p: 3 }}>
                            <OddsAnalysisHub
                                games={games}
                                onAnalyzeOdds={(gameId) => {
                                  const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                  const msg = SportsBettingAssistantMessageBuilder.collectOddsData(missionId, clientId, clientId, {
                                    updateFrequency: 'hourly',
                                    validateAccuracy: true,
                                    detectArbitrageOpportunities: true
                                  });
                                  sendMessage(JSON.stringify(msg));
                                }}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 1}>
                    {tabValue === 1 && (
                        <Box sx={{ p: 3 }}>
                            <BettingStrategyCenter
                                strategies={strategies}
                                onSelectStrategy={(strategy) => {
                                  const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                  const msg = SportsBettingAssistantMessageBuilder.assessBettingRisk(missionId, clientId, clientId, {
                                    profilerType: 'standardized',
                                    includeHistoricalContext: true
                                  });
                                  sendMessage(JSON.stringify(msg));
                                }}
                                onCreateStrategy={(name, description) => {
                                  const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                  const msg = SportsBettingAssistantMessageBuilder.assessBettingRisk(missionId, clientId, clientId, {
                                    profilerType: 'behavioral',
                                    assessIncreasingBets: true
                                  });
                                  sendMessage(JSON.stringify(msg));
                                }}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 2}>
                    {tabValue === 2 && (
                        <Box sx={{ p: 3 }}>
                            <BankrollManagementCenter
                                onUpdateBankroll={(amount) => {
                                  const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                  const msg = SportsBettingAssistantMessageBuilder.manageBankroll(missionId, clientId, clientId, {
                                    unitSizingMethod: 'percentageBased'
                                  });
                                  sendMessage(JSON.stringify(msg));
                                }}
                                onSetUnits={(unitSize) => {
                                  const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                  const msg = SportsBettingAssistantMessageBuilder.manageBankroll(missionId, clientId, clientId, {
                                    unitSizingMethod: 'fixedAmount'
                                  });
                                  sendMessage(JSON.stringify(msg));
                                }}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 3}>
                    {tabValue === 3 && (
                        <Box sx={{ p: 3 }}>
                            <PerformanceTrackingDashboard
                                wagers={wagers}
                                onAnalyzePerformance={() => {
                                  const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                  const msg = SportsBettingAssistantMessageBuilder.assessBettingRisk(missionId, clientId, clientId, {
                                    includeHistoricalContext: true
                                  });
                                  sendMessage(JSON.stringify(msg));
                                }}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 4}>
                    {tabValue === 4 && (
                        <Box sx={{ p: 3 }}>
                            <LiveBettingConsole
                                games={games}
                                onPlaceBet={(gameId, selection, amount) => {
                                  const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                  const msg = SportsBettingAssistantMessageBuilder.collectOddsData(missionId, clientId, clientId, {
                                    updateFrequency: 'realtime',
                                    detectArbitrageOpportunities: false
                                  });
                                  sendMessage(JSON.stringify(msg));
                                }}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 5}>
                    {tabValue === 5 && (
                        <Box sx={{ p: 3 }}>
                            <SportsAnalyticsStudio
                                insights={analyticsInsights}
                                onGenerateInsights={(sport) => {
                                  const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                  const msg = SportsBettingAssistantMessageBuilder.collectOddsData(missionId, clientId, clientId, {
                                    updateFrequency: 'daily'
                                  });
                                  sendMessage(JSON.stringify(msg));
                                }}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 6}>
                    {tabValue === 6 && (
                        <Box sx={{ p: 3 }}>
                            <ResponsibleGamblingCenter
                                onSetLimits={(dailyLimit, weeklyLimit) => {
                                  const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                  const msg = SportsBettingAssistantMessageBuilder.manageBankroll(missionId, clientId, clientId, {
                                    unitSizingMethod: 'conservative'
                                  });
                                  sendMessage(JSON.stringify(msg));
                                }}
                                onReportConcerns={() => {
                                  const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                  const msg = SportsBettingAssistantMessageBuilder.assessBettingRisk(missionId, clientId, clientId, {
                                    profilerType: 'ASTI'
                                  });
                                  sendMessage(JSON.stringify(msg));
                                }}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 7}>
                    {tabValue === 7 && (
                        <Box sx={{ p: 3 }}>
                            <AlertSystem
                                alerts={alerts}
                                onDismissAlert={(alertId) => {
                                  const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                  const msg = SportsBettingAssistantMessageBuilder.collectOddsData(missionId, clientId, clientId, {
                                    validateAccuracy: true
                                  });
                                  sendMessage(JSON.stringify(msg));
                                }}
                            />
                        </Box>
                    )}
                </Box>
            </Box>

            <Box sx={{ width: '50%', borderLeft: '1px solid #e0e0e0' }}>
                <ChatPanel messages={messages} onSendMessage={sendMessage} isLoading={isLoading} error={error} assistantName="Sports Wager Advisor" enableVoiceInput={true} />
            </Box>
        </Box>
    );
};

const SportsWagerAdvisorAssistant: React.FC<{ clientId: string }> = ({ clientId }) => {
  return (
    <BaseAssistantPage
      title="Sports Wager Advisor"
      description="Analyze odds, track betting performance, manage bankroll, and develop betting strategies. Get help with sports analytics, risk management, and responsible gambling practices."
      client={financeAssistantClient}
      initialPrompt="Hello! I need help with sports betting analysis and strategy."
      clientId={clientId}
    >
      {({ messages, sendMessage, sendEvent, assistantState, isLoading, error, humanInputRequired, submitHumanInput }) => (
        <SportsWagerAdvisorContent
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

export default SportsWagerAdvisorAssistant;



