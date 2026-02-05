import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { BaseAssistantPage } from '../shared/BaseAssistantPage';
import { hrAssistantClient } from '../shared/assistantClients';
import { Tabs, Tab, Box, Typography } from '@mui/material/index.js';
import { ConversationMessage } from '@cktmcs/sdk';

import JobManagementCenter from './JobManagementCenter';
import CandidatePipeline from './CandidatePipeline';
import InterviewSchedulingInterface from './InterviewSchedulingInterface';
import HiringAnalyticsDashboard from './HiringAnalyticsDashboard';
import ComplianceMonitoring from './ComplianceMonitoring';
import { ChatPanel } from '../../assistants/shared/components/ChatPanel';

// Define types
interface JobPosting {
  id: string;
  title: string;
  department: string;
  status: 'Open' | 'Closed' | 'On Hold';
  applicants: number;
  hired: number;
}

interface Candidate {
  id: string;
  name: string;
  email: string;
  stage: 'Applied' | 'Interviewing' | 'Offer Extended' | 'Hired' | 'Rejected';
  score: number;
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

const HRRecruitmentAssistantView: React.FC<AssistantRenderProps> = ({ 
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
    clientId = 'hr-assistant-client' 
}) => {
    const [tabValue, setTabValue] = useState(0);

    const buildEvent = useCallback((eventType: string, payload: any, entityId?: string) => ({
        type: eventType,
        payload: { ...payload, conversationId },
        entityId: entityId || payload.id || `${eventType}-${Date.now()}`
    }), [conversationId]);

    useEffect(() => {
        if (conversationId) {
            const collections = ['jobPosting', 'candidate', 'interview', 'hiringAnalytics', 'complianceRecord'];
            collections.forEach(collection => {
                sendEvent(buildEvent(`domain.${collection}.load`, { conversationId }));
            });
        }
    }, [conversationId, getState, sendEvent, buildEvent]);

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
                        aria-label="HR recruitment assistant features tabs"
                    >
                        <Tab label="Job Management" />
                        <Tab label="Candidate Pipeline" />
                        <Tab label="Interview Scheduling" />
                        <Tab label="Hiring Analytics" />
                        <Tab label="Compliance Monitoring" />
                    </Tabs>
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 0}>
                    {tabValue === 0 && (
                        <Box sx={{ p: 3 }}>
                            <JobManagementCenter />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 1}>
                    {tabValue === 1 && (
                        <Box sx={{ p: 3 }}>
                            <CandidatePipeline />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 2}>
                    {tabValue === 2 && (
                        <Box sx={{ p: 3 }}>
                            <InterviewSchedulingInterface />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 3}>
                    {tabValue === 3 && (
                        <Box sx={{ p: 3 }}>
                            <HiringAnalyticsDashboard />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 4}>
                    {tabValue === 4 && (
                        <Box sx={{ p: 3 }}>
                            <ComplianceMonitoring />
                        </Box>
                    )}
                </Box>
            </Box>

            <Box sx={{ width: '50%', borderLeft: '1px solid #e0e0e0' }}>
                <ChatPanel messages={messages} onSendMessage={sendMessage} isLoading={isLoading} error={error} assistantName="HR Recruitment Assistant" enableVoiceInput={true} />
            </Box>
        </Box>
    );
}

const HRRecruitmentAssistant: React.FC<{ clientId: string }> = ({ clientId }) => {
  return (
    <BaseAssistantPage
      title="HR Recruitment Assistant"
      description="Manage job postings, candidate pipelines, interview scheduling, and hiring analytics. Get help with recruitment strategy, compliance monitoring, and candidate evaluation."
      client={hrAssistantClient}
      initialPrompt="Hello! I need help with recruitment and hiring processes."
      clientId={clientId}
    >
      {(props) => <HRRecruitmentAssistantView {...props} clientId={clientId} />}
    </BaseAssistantPage>
  );
};

export default HRRecruitmentAssistant;


