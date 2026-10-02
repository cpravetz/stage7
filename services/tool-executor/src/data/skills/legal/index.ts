import { Tool } from '../../../types';
import { CONTRACT_DOCUMENT_ADVISORY_USER } from './contract-document-advisory';
import { CONTRACT_DOCUMENT_ADVISORY_SCHEDULED } from './contract-document-advisory-scheduled';
import { LEGAL_RESEARCH } from './legal-research';
import { MATTER_DOCUMENT_OPS } from './matter-document-ops';
import { COMPLIANCE_TRACKING_USER } from './compliance-tracking';
import { COMPLIANCE_TRACKING_SCHEDULED } from './compliance-tracking-scheduled';
import { createWorkflow } from '../workflow-common';

export const legalSkills: Tool[] = [
  CONTRACT_DOCUMENT_ADVISORY_USER,
  CONTRACT_DOCUMENT_ADVISORY_SCHEDULED,
  LEGAL_RESEARCH,
  MATTER_DOCUMENT_OPS,
  COMPLIANCE_TRACKING_USER,
  COMPLIANCE_TRACKING_SCHEDULED,
];

export const legalWorkflow = createWorkflow({
  assistant: 'Legal',
  productObject: 'case / matter',
  flow: 'intake → research → draft → review',
  skills: legalSkills,
});
