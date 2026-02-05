import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { BaseAssistantPage } from '../shared/BaseAssistantPage';
import { executiveAssistantClient } from '../shared/assistantClients';
import { Tabs, Tab, Box } from '@mui/material/index.js';
import { ConversationMessage } from '@cktmcs/sdk';

import LeadershipAssessmentCenter from './LeadershipAssessmentCenter';
import DevelopmentPlanningHub from './DevelopmentPlanningHub';
import CareerPlanningStudio from './CareerPlanningStudio';
import CommunicationCoachingCenter from './CommunicationCoachingCenter';
import StrategicDecisionStudio from './StrategicDecisionStudio';
import PerformanceOptimizationDashboard from './PerformanceOptimizationDashboard';
import LeadershipCompetencyMap from './LeadershipCompetencyMap';
import ExecutivePresenceTimeline from './ExecutivePresenceTimeline';
import CoachingInsightSystem from './CoachingInsightSystem';
import { ChatPanel } from '../../assistants/shared/components/ChatPanel';
import { ExecutiveCoachAssistantMessageBuilder } from '../../utils/AssistantMessageBuilders';
import { AssessmentResult, DevelopmentPlan } from './types';

// Mapping function to convert LeadershipAssessment to AssessmentResult
function mapLeadershipAssessmentToAssessmentResult(assessment: any): AssessmentResult {
  return {
    id: assessment.id,
    name: assessment.title || assessment.name,
    score: assessment.results ? parseInt(assessment.results) || 0 : 0,
    maxScore: 100,
    category: 'Leadership',
    feedback: assessment.description || assessment.feedback || 'No feedback available'
  };
}

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

const ExecutiveCoachAssistantView: React.FC<AssistantRenderProps> = ({ 
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
    clientId = 'executive-coach-client' 
}) => {
    const [tabValue, setTabValue] = useState(0);

    const buildEvent = useCallback((eventType: string, payload: any, entityId?: string) => ({
        type: eventType,
        payload: { ...payload, conversationId },
        entityId: entityId || payload.id || `${eventType}-${Date.now()}`
    }), [conversationId]);

    useEffect(() => {
        if (conversationId) {
            const collections = ['leadershipAssessment', 'developmentPlan'];
            collections.forEach(collection => {
                sendEvent(buildEvent(`domain.${collection}.load`, { conversationId }));
            });
        }
    }, [conversationId, getState, sendEvent, buildEvent]);

    const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
        setTabValue(newValue);
    };

    const leadershipAssessments = useMemo(() => 
        getState('leadershipAssessment') || assistantState.leadershipAssessment || [],
        [assistantState, getState]
    );

    // Convert LeadershipAssessment[] to AssessmentResult[]
    const assessments = useMemo(() => {
        return leadershipAssessments.map(mapLeadershipAssessmentToAssessmentResult);
    }, [leadershipAssessments]);

    const developmentPlans = useMemo(() => 
        getState('developmentPlan') || assistantState.developmentPlan || [],
        [assistantState, getState]
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
                        aria-label="executive coach assistant features tabs"
                    >
                        <Tab label="Assessment" />
                        <Tab label="Development Plan" />
                        <Tab label="Career Planning" />
                        <Tab label="Communication" />
                        <Tab label="Strategic Decisions" />
                        <Tab label="Performance" />
                        <Tab label="Competencies" />
                        <Tab label="Presence" />
                        <Tab label="Insights" />
                    </Tabs>
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 0}>
                   {tabValue === 0 && (
                       <Box sx={{ p: 3 }}>
                           <LeadershipAssessmentCenter
                               assessments={assessments}
                               onStartAssessment={() => {
                                 const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                 const msg = ExecutiveCoachAssistantMessageBuilder.startAssessment(missionId, clientId, clientId);
                                 sendMessage(JSON.stringify(msg));
                               }}
                               onUpdateAssessment={(assessmentId, updates) => {
                                 const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                 const msg = ExecutiveCoachAssistantMessageBuilder.updateAssessment(missionId, clientId, clientId, { assessmentId, updates });
                                 sendMessage(JSON.stringify(msg));
                               }}
                           />
                       </Box>
                   )}
               </Box>
                <Box role="tabpanel" hidden={tabValue !== 1}>
                    {tabValue === 1 && (
                        <Box sx={{ p: 3 }}>
                            <DevelopmentPlanningHub
                                plans={developmentPlans}
                                onCreatePlan={(plan) => {
                                  const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                  const msg = ExecutiveCoachAssistantMessageBuilder.createPlan(missionId, clientId, clientId, { plan });
                                  sendMessage(JSON.stringify(msg));
                                }}
                                onUpdatePlan={(planId, updates) => {
                                  const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                  const msg = ExecutiveCoachAssistantMessageBuilder.updatePlan(missionId, clientId, clientId, { planId, updates });
                                  sendMessage(JSON.stringify(msg));
                                }}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 2}>
                    {tabValue === 2 && (
                        <Box sx={{ p: 3 }}>
                            <CareerPlanningStudio />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 3}>
                    {tabValue === 3 && (
                        <Box sx={{ p: 3 }}>
                            <CommunicationCoachingCenter />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 4}>
                    {tabValue === 4 && (
                        <Box sx={{ p: 3 }}>
                            <StrategicDecisionStudio />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 5}>
                    {tabValue === 5 && (
                        <Box sx={{ p: 3 }}>
                            <PerformanceOptimizationDashboard />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 6}>
                    {tabValue === 6 && (
                        <Box sx={{ p: 3 }}>
                            <LeadershipCompetencyMap />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 7}>
                    {tabValue === 7 && (
                        <Box sx={{ p: 3 }}>
                            <ExecutivePresenceTimeline />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 8}>
                    {tabValue === 8 && (
                        <Box sx={{ p: 3 }}>
                            <CoachingInsightSystem />
                        </Box>
                    )}
                </Box>
            </Box>

            <Box sx={{ width: '50%', borderLeft: '1px solid #e0e0e0' }}>
                <ChatPanel messages={messages} onSendMessage={sendMessage} isLoading={isLoading} error={error} assistantName="Executive Coach Assistant" enableVoiceInput={true} />
            </Box>
        </Box>
    );
};

const ExecutiveCoachAssistant: React.FC<{ clientId: string }> = ({ clientId }) => {
  return (
    <BaseAssistantPage
      title="Executive Coach Assistant"
      description="Develop leadership skills, create career plans, improve communication, and make strategic decisions. Get help with executive coaching, leadership development, and career advancement."
      client={executiveAssistantClient}
      initialPrompt="Hello! I need help with executive coaching and leadership development."
      clientId={clientId}
    >
      {(props) => <ExecutiveCoachAssistantView {...props} clientId={clientId} />}
    </BaseAssistantPage>
  );
};

export default ExecutiveCoachAssistant;


