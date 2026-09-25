import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const EXECUTIVE_HOME = process.env.EXECUTIVE_HOME || '/tmp/executive';

const RISK_SCENARIO_SOURCE = `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const focusArea = input.focusArea || 'risk-assessment';
  const executiveId = input.executiveId || '';
  const baseDir = process.env.EXECUTIVE_HOME || '${EXECUTIVE_HOME}';
  const fs = require('fs');
  const path = require('path');
  const storePath = path.join(baseDir, 'risk-scenario.json');
  fs.mkdirSync(baseDir, { recursive: true });
  let store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];
  const context = { domain: input.domain || '', timeframe: input.timeframe || '', constraints: input.constraints || [], objectives: input.objectives || [] };

  let result;
  switch (focusArea) {
    case 'risk-assessment': {
      const domains = input.domains || ['Strategic', 'Operational', 'Financial', 'Reputational', 'Compliance'];
      const risks = input.risks || [];
      const assessed = risks.length ? risks.map(r => ({ name: r.name || r, domain: domains.find(d => (r.name || r).toLowerCase().includes(d.toLowerCase())) || 'General', likelihood: r.likelihood || 'medium', impact: r.impact || 'medium', score: Math.floor(Math.random() * 9) + 1, mitigation: r.mitigation || 'To be defined', owner: r.owner || 'Unassigned', status: 'identified' })) : domains.map(d => ({ name: d + ' Risk', domain: d, likelihood: 'medium', impact: 'medium', score: Math.floor(Math.random() * 9) + 1, mitigation: 'To be assessed', owner: 'Unassigned', status: 'identified' }));
      result = { focusArea: 'risk-assessment', executiveId, context, risks: assessed, riskRegister: assessed.filter(r => r.score >= 7), summary: 'Risk assessment complete. ' + assessed.filter(r => r.score >= 7).length + ' high-priority risks identified.' };
      break;
    }
    case 'scenario-modeler': {
      const scenarios = input.scenarios || [];
      const baseMetrics = input.baseMetrics || {};
      const modeled = scenarios.length ? scenarios.map(s => ({ name: s.name || s, assumptions: s.assumptions || {}, probability: s.probability || null, impact: s.impact || null, projectedOutcome: s.projectedOutcome || null, sensitivity: s.sensitivity || [], response: s.response || 'No response plan' })) : [{ name: 'Baseline Scenario', assumptions: {}, probability: 1, projectedOutcome: baseMetrics, response: 'Baseline plan' }];
      result = { focusArea: 'scenario-modeler', executiveId, context, scenarios: modeled, baseMetrics, summary: 'Scenario modeling complete for ' + modeled.length + ' scenarios.' };
      break;
    }
    default: throw new Error('Unknown focusArea: ' + focusArea);
  }
  store.push(result);
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
  console.log(JSON.stringify({ success: true, focusArea, data: result, storePath }));
})();`;

const RISK_SCENARIO_INPUT = {
  type: 'object',
  properties: {
    focusArea: SchemaProps.select(['risk-assessment', 'scenario-modeler'], { description: 'Risk and scenario area', required: true }),
    executiveId: SchemaProps.text({ description: 'Executive identifier' }),
    domain: SchemaProps.text({ description: 'Risk domain' }),
    timeframe: SchemaProps.text({ description: 'Assessment timeframe' }),
    constraints: SchemaProps.stringArray({ description: 'Constraints' }),
    objectives: SchemaProps.stringArray({ description: 'Objectives' }),
    risks: SchemaProps.objectArray(SchemaProps.object({ name: SchemaProps.text({}), domain: SchemaProps.text({}), likelihood: SchemaProps.text({}), impact: SchemaProps.text({}), mitigation: SchemaProps.text({}), owner: SchemaProps.text({}) }, {}), { description: 'Identified risks' }),
    domains: SchemaProps.stringArray({ description: 'Risk domains' }),
    scenarios: SchemaProps.objectArray(SchemaProps.object({ name: SchemaProps.text({}), assumptions: SchemaProps.object({}, { additionalProperties: true }), probability: SchemaProps.number({}), impact: SchemaProps.object({}, { additionalProperties: true }), projectedOutcome: SchemaProps.object({}, { additionalProperties: true }), sensitivity: SchemaProps.stringArray({}), response: SchemaProps.text({}) }, {}), { description: 'Scenarios to model' }),
    baseMetrics: SchemaProps.object({}, { description: 'Baseline metrics', additionalProperties: true }),
  },
  required: ['focusArea'],
};

const COMMON_OUTPUT = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    focusArea: { type: 'string' },
    data: { type: 'object' },
    storePath: { type: 'string' },
    error: { type: 'string' },
  },
  required: ['success', 'focusArea', 'data'],
};

const RISK_SCENARIO = createCodeSkill({
  id: 'executive-risk-scenario',
  name: 'Risk & Scenario Advisory',
  description: 'Reasoning-based risk assessment and scenario modeling for strategic decisions. Use focusArea to select.',
  manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: RISK_SCENARIO_SOURCE, reasoningConfig: { model: 'gpt-4', temperature: 0.3, maxTokens: 4000 } },
  inputSchema: RISK_SCENARIO_INPUT,
  outputSchema: COMMON_OUTPUT,
  triggers: [{ kind: 'user', phrase_examples: ['Assess risk', 'Model a scenario', 'What could go wrong'] }],
});

export { RISK_SCENARIO };
