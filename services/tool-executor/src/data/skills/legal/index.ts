import { Tool } from '../../../types';
import { CONTRACT_DOCUMENT_ADVISORY } from './contract-document-advisory';
import { LEGAL_RESEARCH } from './legal-research';
import { MATTER_DOCUMENT_OPS } from './matter-document-ops';
import { COMPLIANCE_TRACKING } from './compliance-tracking';
import { annotateStages, createWorkflow, AssistantWorkflow } from '../workflow-common';

export const legalSkills: Tool[] = [
  CONTRACT_DOCUMENT_ADVISORY,
  LEGAL_RESEARCH,
  MATTER_DOCUMENT_OPS,
  COMPLIANCE_TRACKING,
];

annotateStages(legalSkills, {
  'contract-document-advisory': 'intake',
  'legal-research': 'research',
  'matter-document-ops': 'draft',
  'compliance-tracking': 'review',
});

export const legalWorkflow = createWorkflow({
  assistant: 'Legal',
  productObject: 'case / matter',
  flow: 'intake → research → draft → review',
  stages: [
    { name: 'intake', description: 'Matter intake and triage', stageIds: ['contract-document-advisory'] },
    { name: 'research', description: 'Legal research', stageIds: ['legal-research'] },
    { name: 'draft', description: 'Matter document operations', stageIds: ['matter-document-ops'] },
    { name: 'review', description: 'Compliance review and tracking', stageIds: ['compliance-tracking'] },
  ],
}, legalSkills);
