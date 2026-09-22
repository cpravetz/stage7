import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const CAREER_BASE_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

// career_pipeline_report: aggregates application tracking into a pipeline summary.
// Returns { success, data: { tracking, byStatus, total, staleFollowUps } }
const CAREER_PIPELINE_REPORT_SOURCE = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
const fs = require('fs');
const path = require('path');
const baseDir = process.env.CAREER_HOME || '/tmp/career';
const trackingPath = path.join(baseDir, 'applications', 'tracking.json');
const tracking = fs.existsSync(trackingPath) ? JSON.parse(fs.readFileSync(trackingPath, 'utf8')) : [];

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

console.log(JSON.stringify({
  success: true,
  data: {
    tracking,
    byStatus,
    total: tracking.length,
    staleFollowUps,
    generatedAt: new Date().toISOString(),
  },
}));
})();`;

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

const CAREER_PIPELINE_REPORT = createCodeSkill({
  id: 'career_pipeline_report',
  name: 'Pipeline Report',
  description: 'Aggregates application tracking data into a pipeline summary with status breakdowns and stale follow-up detection.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: CAREER_PIPELINE_REPORT_SOURCE,
    configSchema: CAREER_BASE_CONFIG_SCHEMA,
    actionLabel: 'Show pipeline',
  },
  inputSchema: CAREER_PIPELINE_REPORT_INPUT,
  outputSchema: CAREER_PIPELINE_REPORT_OUTPUT,
  triggers: [
    { kind: 'user', phrase_examples: ['How is my pipeline', 'Show my applications', 'What needs follow-up'] },
    { kind: 'schedule', cadence: 'Weekly pipeline summary' },
  ],
});
CAREER_PIPELINE_REPORT.configSchema = CAREER_PIPELINE_REPORT.manifest.configSchema as SchemaRecord;

export { CAREER_PIPELINE_REPORT };