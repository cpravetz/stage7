import { Tool } from '../../types';
import { CONTRACT_DOCUMENT_ADVISORY_USER } from './skills/contract-document-advisory';
import { CONTRACT_DOCUMENT_ADVISORY_SCHEDULED } from './skills/contract-document-advisory-scheduled';
import { LEGAL_RESEARCH } from './skills/legal-research';
import { MATTER_DOCUMENT_OPS } from './skills/matter-document-ops';
import { COMPLIANCE_TRACKING_USER } from './skills/compliance-tracking';
import { COMPLIANCE_TRACKING_SCHEDULED } from './skills/compliance-tracking-scheduled';
import { DRAFT, REDLINE, ANALYZE_CLAUSES, FINALIZE } from './tools/document-production';
import { createWorkflow } from '../../adk/workflow-common';

export const legalSkills: Tool[] = [
  CONTRACT_DOCUMENT_ADVISORY_USER,
  CONTRACT_DOCUMENT_ADVISORY_SCHEDULED,
  LEGAL_RESEARCH,
  MATTER_DOCUMENT_OPS,
  COMPLIANCE_TRACKING_USER,
  COMPLIANCE_TRACKING_SCHEDULED,
  DRAFT,
  REDLINE,
  ANALYZE_CLAUSES,
  FINALIZE,
];

export const legalWorkflow = createWorkflow({
  assistant: 'Legal',
  productObject: 'case / matter',
  flow: 'intake → research → draft → review',
  skills: legalSkills,
});
