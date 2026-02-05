import React, { useState, useEffect, useCallback } from 'react';
import { BaseAssistantPage } from '../shared/BaseAssistantPage';
import { legalAssistantClient } from '../shared/assistantClients';
import { Box, Typography, useTheme, useMediaQuery, Tabs, Tab, IconButton } from '@mui/material';
import { Menu as MenuIcon, Close as CloseIcon, Gavel as GavelIcon, Description as DescriptionIcon, Balance as BalanceIcon, Search as SearchIcon, Folder as FolderIcon, Analytics as AnalyticsIcon, People as PeopleIcon, Business as BusinessIcon, Assignment as AssignmentIcon } from '@mui/icons-material';
import { ConversationMessage } from '@cktmcs/sdk';

// Import domain-specific components
import CaseFileManager from './components/CaseFileManager';
import LegalResearchAnalysis from './components/LegalResearchAnalysis';
import LegalDocumentDrafting from './components/LegalDocumentDrafting';
import ContractReviewAnalysis from './components/ContractReviewAnalysis';
import ComplianceChecking from './components/ComplianceChecking';
import { ChatPanel } from '../../assistants/shared/components/ChatPanel';

// Define types for legal domain
interface LegalCase {
  id: string;
  title: string;
  caseNumber: string;
  status: string;
  client: string;
  practiceArea: string;
  filingDate: string;
  nextDeadline: string;
}

interface LegalDocument {
  id: string;
  title: string;
  type: string;
  status: string;
  lastModified: string;
  version: string;
}

interface LegalResearchResult {
  id: string;
  title: string;
  source: string;
  relevance: number;
  snippet: string;
  jurisdiction: string;
  date: string;
}

interface ContractAnalysis {
  id: string;
  contractName: string;
  riskLevel: 'low' | 'medium' | 'high';
  keyClauses: string[];
  recommendations: string[];
  lastReviewed: string;
}

interface ComplianceIssue {
  id: string;
  regulation: string;
  status: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  dueDate: string;
}


const LegalAdvisorAssistantPage: React.FC<{ clientId: string }> = ({ clientId }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [cases, setCases] = useState<LegalCase[]>([]);
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [researchResults, setResearchResults] = useState<LegalResearchResult[]>([]);
  const [contractAnalyses, setContractAnalyses] = useState<ContractAnalysis[]>([]);
  const [complianceIssues, setComplianceIssues] = useState<ComplianceIssue[]>([]);
  // Local state for document type selection - no API call until Draft button clicked
  const [selectedDocumentType, setSelectedDocumentType] = useState<string | null>(null);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const toggleLeftPanel = () => setLeftPanelOpen(!leftPanelOpen);
  const toggleRightPanel = () => setRightPanelOpen(!rightPanelOpen);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  // Extract data from messages
  const extractLatestToolOutput = useCallback(<T,>(toolName: string, msgList: ConversationMessage[]): T | null => {
    const relevantMessages = msgList.filter(
      (msg) => msg.sender === 'tool' && (msg.content as any)?.tool === toolName
    );
    if (relevantMessages.length > 0) {
      return (relevantMessages[relevantMessages.length - 1].content as any) as T;
    }
    return null;
  }, []);

  return (
    <BaseAssistantPage
      title="Legal Advisor Assistant"
      description="Comprehensive legal assistance with case management, document drafting, legal research, contract analysis, and compliance checking."
      client={legalAssistantClient}
      initialPrompt="Hello! I need legal assistance with a case."
      clientId={clientId}
    >
      {({ messages, sendMessage, isLoading, error, humanInputRequired, submitHumanInput }) => {

        // Update data when messages change
        useEffect(() => {
          setCases(extractLatestToolOutput<{ cases: LegalCase[] }>('CaseManagementTool', messages)?.cases || []);
          setDocuments(extractLatestToolOutput<{ documents: LegalDocument[] }>('DocumentDraftingTool', messages)?.documents || []);
          setResearchResults(extractLatestToolOutput<{ researchResults: LegalResearchResult[] }>('LegalResearchTool', messages)?.researchResults || []);
          setContractAnalyses(extractLatestToolOutput<{ contractAnalyses: ContractAnalysis[] }>('ContractAnalysisTool', messages)?.contractAnalyses || []);
          setComplianceIssues(extractLatestToolOutput<{ complianceIssues: ComplianceIssue[] }>('ComplianceTool', messages)?.complianceIssues || []);
        }, [messages, extractLatestToolOutput]);

        return (
          <Box sx={{ display: 'flex', height: '100%', width: '100%' }}>
            {/* Left Panel - Legal Tools */}
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
                    Legal Tools
                  </Typography>

                  <Tabs
                    value={activeTab}
                    onChange={handleTabChange}
                    orientation="vertical"
                    variant="scrollable"
                    sx={{ borderRight: 1, borderColor: 'divider' }}
                    aria-label="legal advisor tools tabs"
                  >
                    <Tab label="Case Management" icon={<GavelIcon />} iconPosition="start" />
                    <Tab label="Legal Research" icon={<SearchIcon />} iconPosition="start" />
                    <Tab label="Document Drafting" icon={<DescriptionIcon />} iconPosition="start" />
                    <Tab label="Contract Analysis" icon={<AssignmentIcon />} iconPosition="start" />
                    <Tab label="Compliance Checker" icon={<BalanceIcon />} iconPosition="start" />
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
                  Legal Advisor Assistant
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

              <ChatPanel messages={messages} onSendMessage={sendMessage} isLoading={isLoading} error={error} assistantName="Legal Advisor Assistant" enableVoiceInput={true} />
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
                {activeTab === 0 && (
                  <CaseFileManager
                    caseFiles={cases.map(c => ({
                      id: c.id,
                      name: c.title,
                      title: c.title,
                      status: c.status === 'Open' || c.status === 'Closed' ? c.status : 'Open',
                      documents: []
                    }))}
                    onAddCaseFile={() => sendMessage('Please help me create a new case file')}
                    onViewCaseDetails={(caseId) => sendMessage(`Show details for case ${caseId}`)}
                    onUpdateCaseStatus={(caseId, newStatus) => sendMessage(`Update case ${caseId} status to ${newStatus}`)}
                  />
                )}
                {activeTab === 1 && (
                  <LegalResearchAnalysis
                    researchQuery=""
                    onQueryChange={(query) => {}}
                    researchResults={researchResults.map(r => ({
                      id: r.id,
                      title: r.title,
                      query: r.title,
                      summary: r.snippet,
                      snippet: r.snippet,
                      source: r.source,
                      citations: [r.source]
                    }))}
                    onConductResearch={() => sendMessage('Please conduct legal research on my query')}
                    onViewDetails={(resultId) => sendMessage(`Show detailed research results for ${resultId}`)}
                  />
                )}
                {activeTab === 2 && (
                  <LegalDocumentDrafting
                    documentTypes={['Contract', 'Agreement', 'Brief', 'Motion']}
                    selectedDocumentType={selectedDocumentType}
                    onSelectDocumentType={setSelectedDocumentType}
                    documentContent={null}
                    onDraftDocument={() => sendMessage(`I want to draft a ${selectedDocumentType || 'legal'} document`)}
                    onReviewDocument={() => sendMessage('Please review and finalize the drafted document')}
                  />
                )}
                {activeTab === 3 && (
                  <ContractReviewAnalysis
                    uploadedContract={null}
                    analysisResult={contractAnalyses.length > 0 ? {
                      id: contractAnalyses[0].id,
                      documentId: contractAnalyses[0].id,
                      risks: contractAnalyses[0].keyClauses,
                      complianceIssues: contractAnalyses[0].recommendations,
                      summary: `Contract ${contractAnalyses[0].contractName} has ${contractAnalyses[0].riskLevel} risk level`
                    } : null}
                    onUploadContract={() => sendMessage('Please help me upload a contract for analysis')}
                    onAnalyzeContract={() => sendMessage('Please analyze the uploaded contract')}
                    onReviewFindings={() => sendMessage('Please provide detailed recommendations for the contract analysis')}
                  />
                )}
                {activeTab === 4 && (
                  <ComplianceChecking
                    documentToAnalyze={null}
                    complianceRules={complianceIssues.map(issue => ({
                      id: issue.id,
                      name: issue.regulation,
                      status: issue.status === 'Compliant' ? 'Compliant' : issue.status === 'Non-Compliant' ? 'Non-Compliant' : 'Pending Review',
                      details: issue.description
                    }))}
                    onUploadDocument={() => sendMessage('Please help me upload a document for compliance checking')}
                    onCheckCompliance={() => sendMessage('Please check compliance for the uploaded document')}
                    onViewDetails={(ruleId) => sendMessage(`Show detailed compliance information for ${ruleId}`)}
                  />
                )}
              </Box>
            )}
          </Box>
        );
      }}
    </BaseAssistantPage>
  );
};

export default LegalAdvisorAssistantPage;


