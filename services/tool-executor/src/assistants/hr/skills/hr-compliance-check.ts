// @ts-nocheck

import { SchemaProps, createDeclarativeCodeSkill } from '../../../adk/code-skill-factory';
import { HR_DOMAIN_KNOWLEDGE, hrResultSchema } from '../hr-contract';

// ============================================================================
// SKILL 6: hr-compliance-check (Advise)
// Schedule trigger: "Monthly compliance audit"
// ============================================================================

export const HR_COMPLIANCE_CHECK = createDeclarativeCodeSkill({
  id: 'hr-compliance-check',
  name: 'Compliance Audit Check',
  description: 'Generates compliance checks for EEO statements, GDPR consent, and ADEA violations. Runs monthly.',
  persistenceEnvVar: 'HR_HOME',
  configSchema: {
    type: 'object',
    properties: {
      dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
    },
  },
  inputSchema: {
    type: 'object',
    properties: {
      dateRange: SchemaProps.object({
        start: SchemaProps.text({ description: 'Start date for analysis period in ISO 8601 format' }),
        end: SchemaProps.text({ description: 'End date for analysis period in ISO 8601 format' }),
      }, { description: 'Date range for the analysis period' }),
      data: SchemaProps.object({}, { description: 'Compliance candidates data (optional inline override)' }),
      filters: SchemaProps.object({}, { description: 'Filters to apply to the data' }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing; defaults to true', default: true }),
    },
    required: [],
  },
  outputSchema: hrResultSchema('Compliance check report with findings for EEO, GDPR, and ADEA violations'),
  tier: 'advise',
  domainKnowledge: HR_DOMAIN_KNOWLEDGE,
  triggers: [
    { kind: 'schedule', cadence: 'Monthly compliance audit' },
  ],
  isSkill: true,
  async handler(input, ctx) {
    function checkCompliance(records: any[]) {
      const findings: any[] = [];
      records.forEach((r) => {
        if (!r) return;
        if (r.posting && !r.posting.eeoStatement) findings.push({ id: r.id, issue: 'Missing EEO statement in job posting' });
        if (r.data && r.data.sensitiveFields && r.data.sensitiveFields.length > 0 && !r.data.gdprConsent) findings.push({ id: r.id, issue: 'GDPR consent not recorded for candidate data' });
        if (r.decision && r.decision.reason === 'age') findings.push({ id: r.id, issue: 'Decision based on age — potential ADEA violation' });
      });
      return { findings, compliant: findings.length === 0, totalChecked: records.length };
    }

    const inlineData = input.data || null;
    const compliancePath = ctx.store.getFilePath('compliance');
    const store = inlineData ? (Array.isArray(inlineData) ? inlineData : []) : ctx.store.load('compliance', []);

    if (!store.length) {
      return {
  success: false,
  status: 'not-connected',
  data: null,
  error: 'Not connected: ' + 'no compliance records found in ' + compliancePath,
  present: [ctx.render.text('not-connected', 'Connection required', 'Not connected: ' + 'no compliance records found in ' + compliancePath)],
};
    }

    const check = checkCompliance(store);
    const generatedAt = new Date().toISOString();

    const lines = [
      'Compliance Audit Report',
      'Generated: ' + generatedAt,
      '',
      'Total Records Checked: ' + check.totalChecked,
      'Compliant: ' + (check.compliant ? 'Yes' : 'No'),
      'Findings: ' + check.findings.length,
      '',
    ];
    if (check.findings.length > 0) {
      lines.push('Issues Identified:');
      check.findings.forEach((f) => lines.push('  - ' + f.issue + ' (Record: ' + f.id + ')'));
      lines.push('');
    } else {
      lines.push('No compliance issues found.');
      lines.push('');
    }
    lines.push('Source: Local compliance check (no external legal database queried)');
    lines.push('Scope: Checked records in ' + compliancePath + (inlineData ? ' (inline data override)' : '') + ' for EEO, GDPR, and ADEA indicators.');

    return {
      success: true,
      status: 'ok',
      data: { check, generatedAt },
      error: null,
      present: [ctx.render.text('report', 'Compliance Audit', lines)],
    };
  },
});
