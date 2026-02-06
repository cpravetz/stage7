// services/mcsreact/src/assistants/LegalAssistant/types.ts

// Placeholder for types specific to Legal Document Assistant components
// Will be populated as components are created
export interface LegalDocument {
  id: string;
  title: string;
  type: string; // e.g., "Contract", "Agreement", "Brief"
  status: 'Draft' | 'Review' | 'Finalized';
  lastModified: string;
}

export interface ContractAnalysisResult {
  id: string;
  documentId: string;
  risks: string[];
  complianceIssues: string[];
  summary: string;
}

export interface ContractAnalysis {
  id: string;
  contractName: string;
  keyClauses: string[];
  recommendations: string[];
  riskLevel: string;
}

export interface ResearchResult {
  id: string;
  title: string;
  query: string;
  summary: string;
  snippet: string;
  source: string;
  citations: string[];
}

export interface CaseFile {
  id: string;
  name: string;
  title: string;
  status: 'Open' | 'Closed';
  documents: string[]; // List of document IDs
}

export interface ComplianceIssue {
  id: string;
  regulation: string;
  status: 'Compliant' | 'Non-Compliant' | 'Pending Review';
  description: string;
}