import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { BaseAssistantPage } from '../shared/BaseAssistantPage';
import { investmentAdvisorAssistantClient } from '../shared/assistantClients';
import { Tabs, Tab, Box } from '@mui/material/index.js';
import { ConversationMessage } from '@cktmcs/sdk';
import { InvestmentAdvisorMessageBuilder } from '../../utils/AssistantMessageBuilders';

import PortfolioManagementHub from './PortfolioManagementHub';
import MarketResearchDashboard from './MarketResearchDashboard';
import InvestmentStrategyCenter from './InvestmentStrategyCenter';
import { ChatPanel } from '../../assistants/shared/components/ChatPanel';
import { InvestmentStrategy, Portfolio, MarketAlert } from './types';

interface AssistantRenderProps {
    messages: ConversationMessage[];
    sendMessage: (message: string) => Promise<void>;
    sendEvent: (event: any) => Promise<void>;
    assistantState?: Record<string, any>;
    getState: (collectionName: string) => any[];
    mergeAssistantState?: (collection: string, items: any[]) => void;
    conversationId?: string;
    isLoading: boolean;
    error: string | null;
    humanInputRequired: { prompt: string; type: string; metadata: any; inputStepId: string; } | null;
    submitHumanInput: (response: string, inputStepId: string) => void;
    clientId?: string;
}

const InvestmentAdvisorAssistantView: React.FC<AssistantRenderProps> = ({ 
    messages, 
    sendMessage, 
    sendEvent, 
    assistantState = {}, 
    getState = () => [], 
    mergeAssistantState = () => {}, 
    conversationId, 
    isLoading, 
    error, 
    humanInputRequired, 
    submitHumanInput, 
    clientId = 'investment-advisor-client' 
}) => {
    const [tabValue, setTabValue] = useState(0);

    const buildEvent = useCallback((eventType: string, payload: any, entityId?: string) => ({
        type: eventType,
        payload: { ...payload, conversationId },
        entityId: entityId || payload.id || `${eventType}-${Date.now()}`
    }), [conversationId]);

    useEffect(() => {
        if (conversationId) {
            const collections = ['portfolio', 'marketAlert', 'investmentStrategy'];
            collections.forEach(collection => {
                sendEvent(buildEvent(`domain.${collection}.load`, { conversationId }));
            });
        }
    }, [conversationId, sendEvent, buildEvent]);

    const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
        setTabValue(newValue);
    };

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
                        aria-label="investment advisor assistant features tabs"
                    >
                        <Tab label="Portfolio Management" />
                        <Tab label="Market Research" />
                        <Tab label="Investment Strategy" />
                    </Tabs>
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 0}>
                    {tabValue === 0 && (
                        <Box sx={{ p: 3 }}>
                            <PortfolioManagementHub
                                    onCreatePortfolio={(portfolio) => {
                                        const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                        const msg = InvestmentAdvisorMessageBuilder.analyzePortfolio(missionId, clientId, clientId, {
                                            optimizationMethod: 'meanVariance',
                                            includeConstraintVisualization: true,
                                            generateAlternatives: true
                                        });
                                        sendMessage(JSON.stringify(msg));
                                    }}
                                    onUpdatePortfolio={(portfolioId, updates) => {
                                        const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                        const msg = InvestmentAdvisorMessageBuilder.analyzePortfolio(missionId, clientId, clientId, { generateAlternatives: true });
                                        sendMessage(JSON.stringify(msg));
                                    }}
                                    onRebalancePortfolio={(portfolioId) => {
                                        const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                        const msg = InvestmentAdvisorMessageBuilder.analyzePortfolio(missionId, clientId, clientId, { riskAversion: 0.5 });
                                        sendMessage(JSON.stringify(msg));
                                    }}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 1}>
                    {tabValue === 1 && (
                        <Box sx={{ p: 3 }}>
                            <MarketResearchDashboard
                                                                onAnalyzeMarket={(analysis) => {
                                                                    const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                                                    const msg = InvestmentAdvisorMessageBuilder.assessRisk(missionId, clientId, clientId, { 
                                                                        stressTestScenarios: true,
                                                                        exposureMetrics: ['volatility', 'beta', 'vAR']
                                                                    });
                                                                    sendMessage(JSON.stringify(msg));
                                                                }}
                                                                onTrackAlert={(alert) => {
                                                                    const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                                                    const msg = InvestmentAdvisorMessageBuilder.assessRisk(missionId, clientId, clientId, { benchmarkComparison: true });
                                                                    sendMessage(JSON.stringify(msg));
                                                                }}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 2}>
                    {tabValue === 2 && (
                        <Box sx={{ p: 3 }}>
                            <InvestmentStrategyCenter
                                                                onSelectStrategy={(strategy) => {
                                                                    const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                                                    const msg = InvestmentAdvisorMessageBuilder.analyzeGoals(missionId, clientId, clientId, {});
                                                                    sendMessage(JSON.stringify(msg));
                                                                }}
                                                                onCreateCustomStrategy={(strategy) => {
                                                                    const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                                                    const msg = InvestmentAdvisorMessageBuilder.analyzeGoals(missionId, clientId, clientId, {});
                                                                    sendMessage(JSON.stringify(msg));
                                                                }}
                            />
                        </Box>
                    )}
                </Box>
            </Box>

            <Box sx={{ width: '50%', borderLeft: '1px solid #e0e0e0' }}>
                <ChatPanel messages={messages} onSendMessage={sendMessage} isLoading={isLoading} error={error} assistantName="Investment Advisor Assistant" enableVoiceInput={true} />
            </Box>
        </Box>
    );
};

const InvestmentAdvisorAssistant: React.FC<{ clientId: string }> = ({ clientId }) => {
  const viewComponent = (props: any) => <InvestmentAdvisorAssistantView {...props} clientId={clientId} />;
  return (
    <BaseAssistantPage
      title="Investment Advisor Assistant"
      description="Manage investment portfolios, research markets, develop investment strategies, and analyze opportunities. Get help with portfolio management, market analysis, and investment planning."
      client={investmentAdvisorAssistantClient}
      initialPrompt="Hello! I need help with investment advice and portfolio management."
      clientId={clientId}
    >
      {(props) => <InvestmentAdvisorAssistantView {...props} clientId={clientId} />}
    </BaseAssistantPage>
  );
};

export default InvestmentAdvisorAssistant;





