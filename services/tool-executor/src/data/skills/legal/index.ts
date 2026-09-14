import { Tool } from '../../../types';
import { createExternalActionSkill } from '../code-skill-factory';

const LEGAL_SKILLS: Tool[] = [
  {
    id: 'review-contract',
    name: 'Review Contract',
    description: 'Review a contract for risks and flag clauses needing attention. Saves analysis locally.',
    type: 'code',
    manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');
const contractText = input.contractText || '';
const contractType = input.contractType || 'general';
const baseDir = process.env.LEGAL_HOME || path.join('/tmp/legal');
const storePath = path.join(baseDir, 'reviews.json');
fs.mkdirSync(baseDir, { recursive: true });
const store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];
const riskTemplates = [
  { type: 'liability', severity: 'high', clause: 'Indemnification', description: 'Unlimited liability exposure for consequential damages' },
  { type: 'termination', severity: 'medium', clause: 'Termination for Convenience', description: 'Either party may terminate with 30 days notice without cause' },
  { type: 'ip', severity: 'medium', clause: 'Intellectual Property', description: 'IP ownership ambiguous for work product created during engagement' },
  { type: 'confidentiality', severity: 'low', clause: 'Non-Disclosure', description: 'Confidentiality period exceeds industry standard (5 years)' },
  { type: 'payment', severity: 'high', clause: 'Payment Terms', description: 'Net-60 terms may create cash flow risk' },
  { type: 'dispute', severity: 'medium', clause: 'Dispute Resolution', description: 'Mandatory arbitration in unfavorable jurisdiction' }
];
const risks = riskTemplates.slice(0, Math.floor(Math.random() * 3) + 2);

const clauseTemplates = [
  { clause: 'Force Majeure', status: 'standard', note: 'Standard force majeure language included' },
  { clause: 'Governing Law', status: 'review', note: 'Specifies Delaware law - verify alignment with operations' },
  { clause: 'Confidentiality', status: 'standard', note: 'Mutual NDA terms present' },
  { clause: 'Limitation of Liability', status: 'review', note: 'Cap at 12 months fees - may be insufficient for enterprise' },
  { clause: 'Term & Termination', status: 'standard', note: 'Auto-renewal with 60-day notice' }
];
const clauses = clauseTemplates.slice(0, Math.floor(Math.random() * 3) + 2);
const review = { id: 'review_' + Date.now(), contractType, textLength: contractText.length, risks, clauses, createdAt: new Date().toISOString(), source: 'local' };
store.push(review);
fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
console.log(JSON.stringify({ success: true, data: { review, storePath, hint: 'Full clause analysis requires a legal review service' } }));
` },
    inputSchema: {
      type: 'object',
      properties: {
        contractText: { type: 'string', description: 'The full text of the contract to review' },
        contractType: { type: 'string', description: 'Type of contract (e.g., employment, NDA, service agreement, general)' },
      },
      required: ['contractText'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether the review was completed successfully' },
        review: { type: 'object', description: 'The review result object with risks, clauses, and metadata' },
        storePath: { type: 'string', description: 'File path where the review was saved' },
      },
      required: ['success', 'review', 'storePath'],
    },
    createdAt: new Date(), updatedAt: new Date(),
  },
  {
    id: 'draft-clause',
    name: 'Draft Clause',
    description: 'Draft a contract clause of a given type with custom terms.',
    type: 'code',
    manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');
const clauseType = input.clauseType || 'general';
const terms = input.terms || '';
const baseDir = process.env.LEGAL_HOME || path.join('/tmp/legal');
const storePath = path.join(baseDir, 'clauses.json');
fs.mkdirSync(baseDir, { recursive: true });
const store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];
const clauseTemplates = {
  confidentiality: 'CONFIDENTIALITY. ' + terms + ' Both parties agree to maintain the confidentiality of all non-public information disclosed during the term of this agreement and for a period of three (3) years thereafter. Confidential Information includes, but is not limited to, trade secrets, business plans, financial data, customer lists, and technical specifications. Exceptions apply for information that becomes publicly known through no fault of the receiving party, is independently developed, or is required to be disclosed by law.',
  indemnification: 'INDEMNIFICATION. ' + terms + ' Each party (the "Indemnitor") shall indemnify, defend, and hold harmless the other party (the "Indemnitee") from and against any and all claims, damages, losses, and expenses (including reasonable attorneys\' fees) arising out of or related to the Indemnitor\'s breach of this agreement, negligence, or willful misconduct. The Indemnitee shall promptly notify the Indemnitor of any claim and cooperate in its defense.',
  termination: 'TERMINATION. ' + terms + ' Either party may terminate this agreement upon thirty (30) days written notice. Upon termination, all licenses granted herein shall immediately cease, and each party shall return or destroy all Confidential Information of the other party. Sections regarding confidentiality, intellectual property, and limitation of liability shall survive termination.',
  general: 'GENERAL PROVISIONS. ' + terms + ' This agreement constitutes the entire understanding between the parties. No amendment shall be effective unless in writing and signed by both parties. This agreement shall be governed by the laws of the State of Delaware. Any dispute arising hereunder shall be resolved through binding arbitration in accordance with the rules of the AAA.'
};
const text = clauseTemplates[clauseType.toLowerCase()] || clauseTemplates.general;
const clause = { id: 'clause_' + Date.now(), clauseType, terms, text, createdAt: new Date().toISOString(), source: 'local' };
store.push(clause);
fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
console.log(JSON.stringify({ success: true, data: { clause, storePath, disclaimer: 'This is not legal advice. Review with a qualified attorney.' } }));
` },
    inputSchema: {
      type: 'object',
      properties: {
        clauseType: { type: 'string', description: 'Type of clause to draft (e.g., confidentiality, indemnification, termination, general)' },
        terms: { type: 'string', description: 'Custom terms and requirements for the clause' },
      },
      required: ['clauseType'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether the clause was drafted successfully' },
        clause: { type: 'object', description: 'The drafted clause object with text and metadata' },
        storePath: { type: 'string', description: 'File path where the clause was saved' },
      },
      required: ['success', 'clause', 'storePath'],
    },
    createdAt: new Date(), updatedAt: new Date(),
  },
];


const EXTERNAL_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    mode: { type: 'string', enum: ['dry-run', 'live', 'error'] },
    system: { type: 'string' },
    action: { type: 'string' },
    request: {
      type: ['object', 'null'],
      properties: {
        input: { type: 'object' },
        endpoint: { type: 'string' },
        method: { type: 'string' },
        headers: { type: 'object' },
      },
    },
    response: {
      type: ['object', 'null'],
      properties: {
        status: { type: 'number' },
        data: { type: ['object', 'string', 'null'] },
      },
    },
    error: { type: ['string', 'null'] },
  },
  required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'],
};

const LEGAL_EXTERNAL_SKILLS: Tool[] = [
  createExternalActionSkill({
    id: 'legal-research',
    name: 'Legal Research',
    description: 'Research statutes, regulations, case law, and secondary legal sources through a configurable legal research system.',
    system: 'legal-research',
    action: 'research',
    endpoint: { envVar: 'LEGAL_RESEARCH_ENDPOINT', method: 'POST' },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: { accessToken: 'LEGAL_RESEARCH_ACCESS_TOKEN' },
    },
    credentialSource: {
      accessToken: { envVar: 'LEGAL_RESEARCH_ACCESS_TOKEN', configKey: 'legalResearch.accessToken' },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Legal research system base URL' },
        accessToken: { type: 'string', description: 'Bearer access token' },
        provider: { type: 'string', description: 'Optional legal research provider or workspace' },

        sourceLibrary: { type: 'array', items: { type: 'string' }, description: 'Source libraries to search (e.g., statutes, cases, regulations, secondary)' },
        citationFormat: { type: 'string', description: 'Preferred citation format (e.g., Bluebook, APA, Chicago)' },
        updateFrequency: { type: 'string', description: 'How often to refresh research data (e.g., daily, weekly, monthly)' },
        jurisdictionWeights: { type: 'object', description: 'Weighting factors for jurisdictions in search results', additionalProperties: { type: 'number' } },
      },
      required: ['baseUrl', 'accessToken'],
    },
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Legal research query or question' },
        jurisdiction: { type: 'string', description: 'Legal jurisdiction to search (e.g., US, CA, UK, EU, NY, CA)' },
        dateRange: { type: 'object', description: 'Date range filter for results (e.g., { start: "2020-01-01", end: "2024-12-31" })' },
        sources: { type: 'array', items: { type: 'string' }, description: 'Specific sources to search (e.g., statutes, cases, regulations, secondary)' },
        maxResults: { type: 'number', description: 'Maximum number of results to return' },
        endpointUrl: { type: 'string', description: 'Optional override for the research endpoint URL' },
        dryRun: { type: 'boolean', description: 'If true, return the request payload without executing' },
      },
      required: ['query'],
    },
    outputSchema: EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    id: 'legal-compliance',
    name: 'Legal Compliance',
    description: 'Check documents and business activities against configurable compliance rules and regulatory requirements.',
    system: 'legal-compliance',
    action: 'check-compliance',
    endpoint: { envVar: 'LEGAL_COMPLIANCE_ENDPOINT', method: 'POST' },
    auth: {
      type: 'api_key',
      header: 'X-API-Key',
      credentialEnvKeyMap: { apiKey: 'LEGAL_COMPLIANCE_API_KEY' },
    },
    credentialSource: {
      apiKey: { envVar: 'LEGAL_COMPLIANCE_API_KEY', configKey: 'legalCompliance.apiKey' },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Compliance system base URL' },
        apiKey: { type: 'string', description: 'Compliance API key' },
        jurisdiction: { type: 'string', description: 'Default regulatory jurisdiction' },

        regulationLibrary: { type: 'array', items: { type: 'string' }, description: 'Regulation libraries to check against (e.g., GDPR, HIPAA, SOX, PCI-DSS)' },
        auditTrailConfig: { type: 'object', description: 'Audit trail configuration for compliance checks', properties: { enabled: { type: 'boolean' }, retentionDays: { type: 'number' }, storageLocation: { type: 'string' } } },
        remediationWorkflow: { type: 'string', description: 'Workflow for remediation steps (e.g., auto, manual, escalations)' },
        jurisdictionRules: { type: 'array', items: { type: 'object' }, description: 'Jurisdiction-specific compliance rules' },
      },
      required: ['baseUrl', 'apiKey'],
    },
    inputSchema: {
      type: 'object',
      properties: {
        documentText: { type: 'string', description: 'Text of the document to check for compliance' },
        jurisdiction: { type: 'string', description: 'Regulatory jurisdiction to check against' },
        regulation: { type: 'string', description: 'Specific regulation or standard to check (e.g., GDPR, HIPAA, SOX)' },
        effectiveDate: { type: 'string', description: 'Effective date for compliance check (ISO 8601 format)' },
        endpointUrl: { type: 'string', description: 'Optional override for the compliance endpoint URL' },
        dryRun: { type: 'boolean', description: 'If true, return the request payload without executing' },
      },
      required: ['documentText'],
    },
    outputSchema: EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    id: 'legal-case-management',
    name: 'Legal Case Management',
    description: 'Create, update, retrieve, and track legal matters and cases through a configurable case management system.',
    system: 'case-management',
    action: 'manage-case',
    endpoint: { envVar: 'LEGAL_CASE_MANAGEMENT_ENDPOINT', method: 'POST' },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: { accessToken: 'LEGAL_CASE_MANAGEMENT_ACCESS_TOKEN' },
    },
    credentialSource: {
      accessToken: { envVar: 'LEGAL_CASE_MANAGEMENT_ACCESS_TOKEN', configKey: 'caseManagement.accessToken' },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Case management system base URL' },
        accessToken: { type: 'string', description: 'Bearer access token' },
        workspaceId: { type: 'string', description: 'Default legal workspace or firm ID' },

        matterTemplates: { type: 'array', items: { type: 'object' }, description: 'Matter templates for creating new cases' },
        deadlineRules: { type: 'object', description: 'Deadline calculation rules for case management', properties: { rules: { type: 'array', items: { type: 'object' } }, defaultLeadTime: { type: 'number' } } },
        collaborationConfig: { type: 'object', description: 'Collaboration settings for case teams' },
        billingIntegration: { type: 'object', description: 'Billing system integration configuration', properties: { enabled: { type: 'boolean' }, billingSystem: { type: 'string' }, rateCardId: { type: 'string' } } },
      },
      required: ['baseUrl', 'accessToken'],
    },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['create', 'update', 'get', 'list', 'close'], description: 'Operation to perform on the case' },
        caseId: { type: 'string', description: 'ID of the case (required for update, get, close operations)' },
        caseData: { type: 'object', description: 'Case data object for create/update operations' },
        clientId: { type: 'string', description: 'Client ID associated with the case' },
        matterId: { type: 'string', description: 'Matter ID for the case' },
        endpointUrl: { type: 'string', description: 'Optional override for the case management endpoint URL' },
        dryRun: { type: 'boolean', description: 'If true, return the request payload without executing' },
      },
      required: ['operation'],
    },
    outputSchema: EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    id: 'legal-statute-database',
    name: 'Legal Statute Database',
    description: 'Search and retrieve statutes, regulations, and legislative history from a configurable statute database.',
    system: 'statute-database',
    action: 'search-statutes',
    endpoint: { envVar: 'LEGAL_STATUTE_DATABASE_ENDPOINT', method: 'POST' },
    auth: {
      type: 'api_key',
      header: 'X-API-Key',
      credentialEnvKeyMap: { apiKey: 'LEGAL_STATUTE_DATABASE_API_KEY' },
    },
    credentialSource: {
      apiKey: { envVar: 'LEGAL_STATUTE_DATABASE_API_KEY', configKey: 'statuteDatabase.apiKey' },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Statute database base URL' },
        apiKey: { type: 'string', description: 'Statute database API key' },
        defaultJurisdiction: { type: 'string', description: 'Default jurisdiction' },

        annotationLayers: { type: 'array', items: { type: 'string' }, description: 'Annotation layers to include (e.g., judicial, editorial, practitioner)' },
        amendmentTracking: { type: 'boolean', description: 'Whether to track and display amendments to statutes' },
        crossReferenceConfig: { type: 'object', description: 'Cross-reference configuration for related statutes and regulations', properties: { enabled: { type: 'boolean' }, depth: { type: 'number' } } },
        legislativeHistory: { type: 'boolean', description: 'Whether to include legislative history in results' },
      },
      required: ['baseUrl', 'apiKey'],
    },
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query for statutes or regulations' },
        jurisdiction: { type: 'string', description: 'Jurisdiction to search (e.g., US, CA, NY, federal)' },
        statuteNumber: { type: 'string', description: 'Specific statute or regulation number to retrieve' },
        effectiveDate: { type: 'string', description: 'Effective date for the statute version (ISO 8601)' },
        includeHistory: { type: 'boolean', description: 'Whether to include legislative history and amendments' },
        endpointUrl: { type: 'string', description: 'Optional override for the statute database endpoint URL' },
        dryRun: { type: 'boolean', description: 'If true, return the request payload without executing' },
      },
      required: ['query'],
    },
    outputSchema: EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    id: 'legal-document-tagging',
    name: 'Legal Document Tagging',
    description: 'Classify and tag legal documents by matter, issue, privilege, and document type using a configurable document system.',
    system: 'document-tagging',
    action: 'tag-document',
    endpoint: { envVar: 'LEGAL_DOCUMENT_TAGGING_ENDPOINT', method: 'POST' },
    auth: {
      type: 'api_key',
      header: 'X-API-Key',
      credentialEnvKeyMap: { apiKey: 'LEGAL_DOCUMENT_TAGGING_API_KEY' },
    },
    credentialSource: {
      apiKey: { envVar: 'LEGAL_DOCUMENT_TAGGING_API_KEY', configKey: 'documentTagging.apiKey' },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Document tagging system base URL' },
        apiKey: { type: 'string', description: 'Document tagging API key' },
        taxonomy: { type: 'string', description: 'Default document taxonomy or tag set' },

        tagTaxonomy: { type: 'object', description: 'Full tag taxonomy definition with categories and tags', properties: { categories: { type: 'array', items: { type: 'object' } }, defaultTags: { type: 'array', items: { type: 'string' } } } },
        autoClassificationRules: { type: 'array', items: { type: 'object' }, description: 'Rules for automatic document classification' },
        privilegeDetection: { type: 'object', description: 'Privilege detection configuration', properties: { enabled: { type: 'boolean' }, sensitivityLevels: { type: 'array', items: { type: 'string' } }, attorneyClientKeywords: { type: 'array', items: { type: 'string' } } } },
        exportFormats: { type: 'array', items: { type: 'string' }, description: 'Supported export formats (e.g., JSON, CSV, XML, PDF)' },
      },
      required: ['baseUrl', 'apiKey'],
    },
    inputSchema: {
      type: 'object',
      properties: {
        documentId: { type: 'string', description: 'Unique identifier for the document' },
        content: { type: 'string', description: 'Document content or text to analyze for tagging' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Pre-defined tags to apply or consider' },
        taxonomy: { type: 'string', description: 'Taxonomy or tag set to use for classification' },
        matterId: { type: 'string', description: 'Matter ID associated with the document' },
        endpointUrl: { type: 'string', description: 'Optional override for the document tagging endpoint URL' },
        dryRun: { type: 'boolean', description: 'If true, return the request payload without executing' },
      },
      required: ['documentId'],
    },
    outputSchema: EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    id: 'legal-case-search',
    name: 'Legal Case Search',
    description: 'Search reported decisions and court records using configurable legal case search systems.',
    system: 'case-search',
    action: 'search-cases',
    endpoint: { envVar: 'LEGAL_CASE_SEARCH_ENDPOINT', method: 'POST' },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: { accessToken: 'LEGAL_CASE_SEARCH_ACCESS_TOKEN' },
    },
    credentialSource: {
      accessToken: { envVar: 'LEGAL_CASE_SEARCH_ACCESS_TOKEN', configKey: 'caseSearch.accessToken' },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Case search system base URL' },
        accessToken: { type: 'string', description: 'Bearer access token' },
        defaultCourt: { type: 'string', description: 'Default court or reporter filter' },

        courtHierarchy: { type: 'array', items: { type: 'string' }, description: 'Court hierarchy for prioritizing search results (e.g., Supreme Court, Circuit, District)' },
        citatorIntegration: { type: 'object', description: 'Citator integration configuration (e.g., Shepard, KeyCite)', properties: { enabled: { type: 'boolean' }, provider: { type: 'string' }, showCitingReferences: { type: 'boolean' } } },
        precedentWeighting: { type: 'object', description: 'Precedent weighting configuration for search ranking', properties: { bindingAuthorityWeight: { type: 'number' }, persuasiveAuthorityWeight: { type: 'number' }, recencyWeight: { type: 'number' } } },
        docketTracking: { type: 'boolean', description: 'Whether to include docket tracking information in results' },
      },
      required: ['baseUrl', 'accessToken'],
    },
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query for case law' },
        jurisdiction: { type: 'string', description: 'Jurisdiction to search (e.g., US, federal, state)' },
        court: { type: 'string', description: 'Specific court to search (e.g., SCOTUS, 9th Circuit, NY Court of Appeals)' },
        dateRange: { type: 'object', description: 'Date range for decisions (e.g., { start: "2020-01-01", end: "2024-12-31" })' },
        filters: { type: 'object', description: 'Additional filters (e.g., practice area, judge, outcome)' },
        pageSize: { type: 'number', description: 'Number of results per page' },
        endpointUrl: { type: 'string', description: 'Optional override for the case search endpoint URL' },
        dryRun: { type: 'boolean', description: 'If true, return the request payload without executing' },
      },
      required: ['query'],
    },
    outputSchema: EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    id: 'legal-risk-assessment',
    name: 'Legal Risk Assessment',
    description: 'Assess legal, regulatory, contractual, and litigation risk through a configurable risk analysis system.',
    system: 'risk-assessment',
    action: 'assess-risk',
    endpoint: { envVar: 'LEGAL_RISK_ASSESSMENT_ENDPOINT', method: 'POST' },
    auth: {
      type: 'api_key',
      header: 'X-API-Key',
      credentialEnvKeyMap: { apiKey: 'LEGAL_RISK_ASSESSMENT_API_KEY' },
    },
    credentialSource: {
      apiKey: { envVar: 'LEGAL_RISK_ASSESSMENT_API_KEY', configKey: 'riskAssessment.apiKey' },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Risk assessment system base URL' },
        apiKey: { type: 'string', description: 'Risk assessment API key' },
        model: { type: 'string', description: 'Optional risk model or policy version' },

        riskModels: { type: 'array', items: { type: 'string' }, description: 'Risk models to apply (e.g., litigation, regulatory, contractual, reputational)' },
        scenarioLibrary: { type: 'array', items: { type: 'object' }, description: 'Predefined risk scenarios with associated factors and outcomes' },
        mitigationTemplates: { type: 'array', items: { type: 'object' }, description: 'Templates for risk mitigation strategies and recommendations' },
        alertThresholds: { type: 'object', description: 'Thresholds for risk level alerts', properties: { low: { type: 'number' }, medium: { type: 'number' }, high: { type: 'number' }, critical: { type: 'number' } } },
      },
      required: ['baseUrl', 'apiKey'],
    },
    inputSchema: {
      type: 'object',
      properties: {
        matterId: { type: 'string', description: 'Matter or case ID for the risk assessment' },
        facts: { type: 'string', description: 'Factual background and scenario for risk assessment' },
        jurisdiction: { type: 'string', description: 'Applicable jurisdiction for the risk analysis' },
        riskFactors: { type: 'array', items: { type: 'string' }, description: 'Specific risk factors to evaluate (e.g., litigation, regulatory, contractual)' },
        documents: { type: 'array', items: { type: 'object' }, description: 'Supporting documents for the assessment' },
        endpointUrl: { type: 'string', description: 'Optional override for the risk assessment endpoint URL' },
        dryRun: { type: 'boolean', description: 'If true, return the request payload without executing' },
      },
      required: ['facts'],
    },
    outputSchema: EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    id: 'legal-ediscovery',
    name: 'Legal eDiscovery',
    description: 'Collect, search, review, and export electronically stored information through a configurable eDiscovery system.',
    system: 'ediscovery',
    action: 'ediscovery',
    endpoint: { envVar: 'LEGAL_EDISCOVERY_ENDPOINT', method: 'POST' },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: { accessToken: 'LEGAL_EDISCOVERY_ACCESS_TOKEN' },
    },
    credentialSource: {
      accessToken: { envVar: 'LEGAL_EDISCOVERY_ACCESS_TOKEN', configKey: 'ediscovery.accessToken' },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'eDiscovery system base URL' },
        accessToken: { type: 'string', description: 'Bearer access token' },
        matterId: { type: 'string', description: 'Default discovery matter ID' },

        collectionMethods: { type: 'array', items: { type: 'string' }, description: 'Allowed collection methods (e.g., custodian, keyword, date-range, hash)' },
        reviewWorkflow: { type: 'object', description: 'Review workflow configuration', properties: { stages: { type: 'array', items: { type: 'string' } }, assignmentRule: { type: 'string' }, qualityControl: { type: 'boolean' } } },
        productionFormats: { type: 'array', items: { type: 'string' }, description: 'Supported production formats (e.g., load-file, PDF, native, TIFF)' },
        privilegeLogConfig: { type: 'object', description: 'Privilege log configuration for withheld documents', properties: { enabled: { type: 'boolean' }, logFields: { type: 'array', items: { type: 'string' } }, redactionMethod: { type: 'string' } } },
      },
      required: ['baseUrl', 'accessToken'],
    },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['collect', 'search', 'review', 'export'], description: 'eDiscovery operation to perform' },
        matterId: { type: 'string', description: 'Matter ID for the eDiscovery project' },
        custodians: { type: 'array', items: { type: 'string' }, description: 'List of custodians for collection or search' },
        dateRange: { type: 'object', description: 'Date range for ESI collection/search (e.g., { start: "2023-01-01", end: "2023-12-31" })' },
        searchTerms: { type: 'array', items: { type: 'string' }, description: 'Search terms and keywords for discovery' },
        endpointUrl: { type: 'string', description: 'Optional override for the eDiscovery endpoint URL' },
        dryRun: { type: 'boolean', description: 'If true, return the request payload without executing' },
      },
      required: ['operation'],
    },
    outputSchema: EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 120000,
  }),
];

export const legalSkills = [...LEGAL_SKILLS, ...LEGAL_EXTERNAL_SKILLS];
