// @ts-nocheck

import { Tool, SchemaRecord } from '../../../types';
import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';

const CAREER_BASE_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

// career-pipeline-report: aggregates application tracking into a pipeline summary.
// Returns { success, data: { tracking, byStatus, total, staleFollowUps } }

const CAREER_PIPELINE_REPORT_INPUT = {
  type: 'object',
  properties: {},
};

const CAREER_PIPELINE_REPORT_OUTPUT = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        tracking: { type: 'array' },
        byStatus: { type: 'object' },
        total: { type: 'number' },
        staleFollowUps: { type: 'array' },
        generatedAt: { type: 'string', format: 'date-time' },
      },
    },
  },
  required: ['success', 'data'],
};

const CAREER_PIPELINE_REPORT = createDeclarativeCodeSkill({
  id: 'career-pipeline-report',
  domainKnowledge: 'Application pipeline reporting: status breakdowns, stage conversion, and stale follow-up detection across an active search.',
  tier: 'advise',
  isSkill: false,
  name: 'Pipeline Report',
  description: 'Aggregates application tracking data into a pipeline summary with status breakdowns and stale follow-up detection.',
  persistenceEnvVar: 'CAREER_HOME',
  inputSchema: CAREER_PIPELINE_REPORT_INPUT,
  outputSchema: CAREER_PIPELINE_REPORT_OUTPUT,
  triggers: [
    { kind: 'user', phrase_examples: ['How is my pipeline', 'Show my applications', 'What needs follow-up'] },
  ],
  manifest: {
    configSchema: CAREER_BASE_CONFIG_SCHEMA,
    actionLabel: 'Show pipeline'
  },
  handler: async function handler(input, ctx) {
      const tracking = ctx.store.load('trackingPath', []);

      const byStatus = {};
      for (const t of tracking) {
      const s = t.status || 'unknown';
      byStatus[s] = (byStatus[s] || 0) + 1;
      }

      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const staleFollowUps = tracking.filter((t) => {
      const applied = t.appliedAt ? new Date(t.appliedAt).getTime() : 0;
      return applied && applied < sevenDaysAgo && (t.status === 'submitted' || t.status === 'dry_run');
      });
    }
  });
CAREER_PIPELINE_REPORT.configSchema = CAREER_BASE_CONFIG_SCHEMA;
CAREER_PIPELINE_REPORT.configSchema = CAREER_PIPELINE_REPORT.manifest.configSchema as SchemaRecord;

export { CAREER_PIPELINE_REPORT };
