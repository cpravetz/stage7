import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { BaseAssistantPage } from '../shared/BaseAssistantPage';
import { legalAssistantClient } from '../shared/assistantClients';
import { Tabs, Tab, Box, Typography } from '@mui/material/index.js';
import { ConversationMessage } from '@cktmcs/sdk';
import { LegalAssistantMessageBuilder } from '../../utils/AssistantMessageBuilders';
import {
  CaseFile,
  LegalDocument,
  ResearchResult,
  ContractAnalysisResult,
  ContractAnalysis,
  ComplianceIssue
} from './types';
import CaseFileManager from './components/CaseFileManager';
import LegalResearchAnalysis from './components/LegalResearchAnalysis';
import LegalDocumentDrafting from './components/LegalDocumentDrafting';
import ContractReviewAnalysis from './components/ContractReviewAnalysis';
import ComplianceChecking from './components/ComplianceChecking';
import { ChatPanel } from '../../assistants/shared/components/ChatPanel';

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
    clientId: string;
}

const LegalAdvisorAssistantView: React.FC<AssistantRenderProps> = ({ 
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
    clientId 
}) => {
    const [tabValue, setTabValue] = useState(0);
    const [selectedDocumentType, setSelectedDocumentType] = useState<string | null>(null);

    const buildEvent = useCallback((eventType: string, payload: any, entityId?: string) => ({
        type: eventType,
        payload: { ...payload, conversationId },
        entityId: entityId || payload.id || `${eventType}-${Date.now()}`
    }), [conversationId]);

    useEffect(() => {
        if (conversationId) {
            const collections = ['caseFile', 'legalDocument', 'researchResult', 'contractAnalysis', 'complianceIssue'];
            collections.forEach(collection => {
                sendEvent(buildEvent(`domain.${collection}.load`, { conversationId }));
            });
        }
    }, [conversationId, sendEvent, buildEvent]);

    const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
        setTabValue(newValue);
    };

    const cases = useMemo(() => 
        getState?.('caseFile') || assistantState.caseFile || [],
        [assistantState, getState]
    );

    const documents = useMemo(() => 
        getState?.('legalDocument') || assistantState.legalDocument || [],
        [assistantState, getState]
    );

    const researchResults = useMemo(() => 
        getState?.('researchResult') || assistantState.researchResult || [],
        [assistantState, getState]
    );

    const contractAnalyses = useMemo(() => 
        getState?.('contractAnalysis') || assistantState.contractAnalysis || [],
        [assistantState, getState]
    );

    const complianceIssues = useMemo(() => 
        getState?.('complianceIssue') || assistantState.complianceIssue || [],
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
                        aria-label="legal advisor assistant features tabs"
                    >
                        <Tab label="Case Management" />
                        <Tab label="Legal Research" />
                        <Tab label="Document Drafting" />
                        <Tab label="Contract Analysis" />
                        <Tab label="Compliance Checking" />
                    </Tabs>
                </Box>

                <Box role="tabpanel" hidden={tabValue !== 0}>
                    {tabValue === 0 && (
                        <Box sx={{ p: 3 }}>
                            <CaseFileManager
                                caseFiles={cases.map(c => ({
                                    id: c.id,
                                    name: c.name,
                                    title: c.title,
                                    status: c.status,
                                    documents: c.documents
                                }))}
                                onAddCaseFile={async () => { 
                                    const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                    const msg = LegalAssistantMessageBuilder.performEDiscovery(missionId, clientId, clientId, { processingLevel: 'advanced' });
                                    await sendMessage(JSON.stringify(msg)); 
                                }}
                                onViewCaseDetails={async (caseId) => { 
                                    const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                    const msg = LegalAssistantMessageBuilder.performEDiscovery(missionId, clientId, clientId, { processingLevel: 'advanced' });
                                    await sendMessage(JSON.stringify(msg)); 
                                }}
                                onUpdateCaseStatus={async (caseId, newStatus) => { 
                                    const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';
                                    const msg = LegalAssistantMessageBuilder.analyzeCompliance(missionId, clientId, clientId, { flagIssues: true });
                                    await sendMessage(JSON.stringify(msg)); 
                                }}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 1}>
                    {tabValue === 1 && (
                        <Box sx={{ p: 3 }}>
                            <LegalResearchAnalysis
                                researchQuery=""
                                onQueryChange={(query) => {}}
                                researchResults={researchResults.map(r => ({
                                    id: r.id,
                                    title: r.title,
                                    query: r.query,
                                    summary: r.summary,
                                    snippet: r.snippet,
                                    source: r.source,
                                    citations: r.citations
                                }))}
                                onConductResearch={async () => { 
                                    const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';                                   const msg = LegalAssistantMessageBuilder.performEDiscovery(missionId, clientId, clientId, { processingLevel: 'intermediate' });
                                    await sendMessage(JSON.stringify(msg)); 
                                }}
                                onViewDetails={async (resultId) => { 
                                    const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';                                   const msg = LegalAssistantMessageBuilder.analyzeCompliance(missionId, clientId, clientId, { provideRecommendations: true });
                                    await sendMessage(JSON.stringify(msg)); 
                                }}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 2}>
                    {tabValue === 2 && (
                        <Box sx={{ p: 3 }}>
                            <LegalDocumentDrafting
                                documentTypes={['Contract', 'Agreement', 'Brief', 'Motion']}
                                selectedDocumentType={selectedDocumentType}
                                onSelectDocumentType={setSelectedDocumentType}
                                documentContent={null}
                                onDraftDocument={async () => { 
                                    const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';                                   const msg = LegalAssistantMessageBuilder.analyzeCompliance(missionId, clientId, clientId, { flagIssues: true });
                                    await sendMessage(JSON.stringify(msg)); 
                                }}
                                onReviewDocument={async () => { 
                                    const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';                                   const msg = LegalAssistantMessageBuilder.analyzeCompliance(missionId, clientId, clientId, { provideRecommendations: true });
                                    await sendMessage(JSON.stringify(msg)); 
                                }}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 3}>
                    {tabValue === 3 && (
                        <Box sx={{ p: 3 }}>
                            <ContractReviewAnalysis
                                uploadedContract={null}
                                analysisResult={contractAnalyses.length > 0 ? {
                                    id: contractAnalyses[0].id,
                                    documentId: contractAnalyses[0].id,
                                    risks: contractAnalyses[0].keyClauses,
                                    complianceIssues: contractAnalyses[0].recommendations,
                                    summary: `Contract ${contractAnalyses[0].contractName} has ${contractAnalyses[0].riskLevel} risk level`
                                } : null}
                                onUploadContract={async () => { 
                                    const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';                                   const msg = LegalAssistantMessageBuilder.performEDiscovery(missionId, clientId, clientId, { detectPII: true });
                                    await sendMessage(JSON.stringify(msg)); 
                                }}
                                onAnalyzeContract={async () => { 
                                    const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';                                   const msg = LegalAssistantMessageBuilder.analyzeCompliance(missionId, clientId, clientId, { flagIssues: true, provideRecommendations: true });
                                    await sendMessage(JSON.stringify(msg)); 
                                }}
                                onReviewFindings={async () => { 
                                    const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';                                   const msg = LegalAssistantMessageBuilder.analyzeCompliance(missionId, clientId, clientId, { provideRecommendations: true });
                                    await sendMessage(JSON.stringify(msg)); 
                                }}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 4}>
                    {tabValue === 4 && (
                        <Box sx={{ p: 3 }}>
                            <ComplianceChecking
                                documentToAnalyze={null}
                                complianceRules={complianceIssues.map(issue => ({
                                    id: issue.id,
                                    name: issue.regulation,
                                    status: issue.status as 'Compliant' | 'Non-Compliant' | 'Pending Review',
                                    details: issue.description
                                }))}
                                onUploadDocument={async () => { 
                                    const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';                                   const msg = LegalAssistantMessageBuilder.performEDiscovery(missionId, clientId, clientId, { processingLevel: 'advanced' });
                                    await sendMessage(JSON.stringify(msg)); 
                                }}
                                onCheckCompliance={async () => { 
                                    const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';                                   const msg = LegalAssistantMessageBuilder.analyzeCompliance(missionId, clientId, clientId, { regulationTypes: ['eeoc', 'ada', 'gdpr'], flagIssues: true });
                                    await sendMessage(JSON.stringify(msg)); 
                                }}
                                onViewDetails={async (ruleId) => { 
                                    const missionId = new URLSearchParams(window.location.search).get('missionId') || 'unknown-mission';                                   const msg = LegalAssistantMessageBuilder.analyzeCompliance(missionId, clientId, clientId, { provideRecommendations: true });
                                    await sendMessage(JSON.stringify(msg)); 
                                }}
                            />
                        </Box>
                    )}
                </Box>
            </Box>

            <Box sx={{ width: '50%', borderLeft: '1px solid #e0e0e0' }}>
                <ChatPanel messages={messages} onSendMessage={sendMessage} isLoading={isLoading} error={error} assistantName="Legal Advisor Assistant" enableVoiceInput={true} />
            </Box>
        </Box>
    );
};

const LegalAdvisorAssistant: React.FC<{ clientId: string }> = ({ clientId }) => {
    return (
        <BaseAssistantPage
            title="Legal Advisor Assistant"
            description="Comprehensive legal assistance with case management, document drafting, legal research, contract analysis, and compliance checking."
            client={legalAssistantClient}
            initialPrompt="Hello! I need legal assistance with a case."
            clientId={clientId}
        >
            {(props) => <LegalAdvisorAssistantView {...props} />}
        </BaseAssistantPage>
    );
};

export default LegalAdvisorAssistant;




