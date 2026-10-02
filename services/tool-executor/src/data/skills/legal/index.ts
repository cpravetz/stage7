import { Tool } from '../../../types';
import { CONTRACT_DOCUMENT_ADVISORY_USER } from './contract-document-advisory';
import { CONTRACT_DOCUMENT_ADVISORY_SCHEDULED } from './contract-document-advisory-scheduled';
import { LEGAL_RESEARCH } from './legal-research';
import { MATTER_DOCUMENT_OPS } from './matter-document-ops';
import { COMPLIANCE_TRACKING_USER } from './compliance-tracking';
import { COMPLIANCE_TRACKING_SCHEDULED } from './compliance-tracking-scheduled';
import { annotateStages, createWorkflow, AssistantWorkflow } from '../workflow-common';

export const legalSkills: Tool[] = [
  CONTRACT_DOCUMENT_ADVISORY_USER,
  CONTRACT_DOCUMENT_ADVISORY_SCHEDULED,
  LEGAL_RESEARCH,
  MATTER_DOCUMENT_OPS,
  COMPLIANCE_TRACKING_USER,
  COMPLIANCE_TRACKING_SCHEDULED,
];

annotateStages(legalSkills, {
  'contract-document-advisory-user': 'intake',
  'contract-document-advisory-scheduled': 'intake',
  'legal-research': 'research',
  'matter-document-ops': 'draft',
  'compliance-tracking-user': 'review',
  'compliance-tracking-scheduled': 'review',
});

export const legalWorkflow = createWorkflow({
  assistant: 'Legal',
  productObject: 'case / matter',
  flow: 'intake → research → draft → review',
  stages: [
    { name: 'intake', description: 'Matter intake and triage', stageIds: ['contract-document-advisory-user', 'contract-document-advisory-scheduled'] },
    { name: 'research', description: 'Legal research', stageIds: ['legal-research'] },
    { name: 'draft', description: 'Matter document operations', stageIds: ['matter-document-ops'] },
    { name: 'review', description: 'Compliance review and tracking', stageIds: ['compliance-tracking-user', 'compliance-tracking-scheduled'] },
  ],
}, legalSkills);
