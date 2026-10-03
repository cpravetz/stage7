// @ts-nocheck
import { Tool, SchemaRecord } from '../../../types';
import { createDeclarativeCodeSkill, createSchemaRecord, SchemaProps } from '../../../adk/code-skill-factory';
import { executiveResultSchema } from '../executive-contract';

function withUxMetadata(schema: SchemaRecord): SchemaRecord {
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!properties) return schema;
  Object.entries(properties).forEach(([key, property], index) => {
    if (!property || typeof property !== 'object') return;
    property.title = property.title || key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
    property.order = typeof property.order === 'number' ? property.order : index + 1;
    property.hint = property.hint || property.description || 'See the tool documentation for details.';
  });
  return schema;
}

const SAFETY_BOUNDARY = 'Executive advisory only: do not commit organizational resources, make binding decisions, or present recommendations as settled fact without explicit approval.';

const RISK_SCENARIO_INPUT = createSchemaRecord({
  focusArea: SchemaProps.select(['risk-assessment', 'scenario-modeler'], { description: 'Risk and scenario area', required: true }),
  domain: SchemaProps.text({ description: 'Risk domain' }),
  timeframe: SchemaProps.text({ description: 'Assessment timeframe' }),
  constraints: SchemaProps.stringArray({ description: 'Constraints' }),
  objectives: SchemaProps.stringArray({ description: 'Objectives' }),
  risks: SchemaProps.objectArray(SchemaProps.object({
    name: SchemaProps.text({}),
    domain: SchemaProps.text({}),
    likelihood: SchemaProps.select(['low', 'medium', 'high', 'critical'], {}),
    impact: SchemaProps.select(['low', 'medium', 'high', 'critical'], {}),
    mitigation: SchemaProps.text({}),
    owner: SchemaProps.text({}),
  }), { description: 'Identified risks' }),
  domains: SchemaProps.stringArray({ description: 'Risk domains' }),
  scenarios: SchemaProps.objectArray(SchemaProps.object({
    name: SchemaProps.text({}),
    assumptions: SchemaProps.object({}, { additionalProperties: true }),
    probability: SchemaProps.number({}),
    impact: SchemaProps.object({}, { additionalProperties: true }),
    projectedOutcome: SchemaProps.object({}, { additionalProperties: true }),
    sensitivity: SchemaProps.stringArray({}),
    response: SchemaProps.text({}),
  }), { description: 'Scenarios to model' }),
  baseMetrics: SchemaProps.object({}, { description: 'Baseline metrics', additionalProperties: true }),
}, { required: ['focusArea'] });

const RISK_SCENARIO_CONFIG = createSchemaRecord({
  executiveHome: SchemaProps.text({ description: 'Executive workspace path; defaults to EXECUTIVE_HOME' }),
});

export const RISK_SCENARIO = createDeclarativeCodeSkill({
  id: 'executive-risk-scenario',
  name: 'Risk & Scenario Advisory',
  description: 'Risk assessment and scenario modeling for strategic decisions. Derives scores from input likelihood/impact; computes projections from supplied assumptions. Use focusArea to select.',
  persistenceEnvVar: 'EXECUTIVE_HOME',
  tier: 'advise',
  domainKnowledge: 'Risk assessment, scenario planning, executive decision support',
  inputSchema: RISK_SCENARIO_INPUT,
  outputSchema: executiveResultSchema('Risk assessment or scenario modeling results with derived scores and projections'),
  triggers: [{ kind: 'user', phrase_examples: ['Assess risk', 'Model a scenario', 'What could go wrong'] }],
  isSkill: true,
  manifest: {
    configSchema: RISK_SCENARIO_CONFIG,
    ui: { view: 'risk-scenario' }
  },
  handler: async function handler(input, ctx) {
      const NL = '\n';
      const SAFETY = "Executive advisory only: do not commit organizational resources, make binding decisions, or present recommendations as settled fact without explicit approval.";

      function fail(status, message, title, extra) {
        const base = { success: false, status: status, error: message, data: null, present: [{ id: 'notice', title: title, kind: 'text', body: message + NL + NL + SAFETY }] };
        if (extra) { for (const key in extra) { base[key] = extra[key]; } }
        return base;
      }

      const focusArea = input.focusArea || 'risk-assessment';
      let store = ctx.store.load('risk-scenario', []);
      const context = {
        domain: input.domain || '',
        timeframe: input.timeframe || '',
        constraints: Array.isArray(input.constraints) ? input.constraints : [],
        objectives: Array.isArray(input.objectives) ? input.objectives : []
      };

      let result;
      let present;
      switch (focusArea) {
        case 'risk-assessment': {
          const domains = Array.isArray(input.domains) ? input.domains : ['Strategic', 'Operational', 'Financial', 'Reputational', 'Compliance'];
          const risks = Array.isArray(input.risks) ? input.risks : [];

          if (!risks.length && !Array.isArray(input.domains)) {
            return fail('not-connected', 'Not connected: no risks supplied and no domains specified for assessment', 'Input required');
          }

          function computeScore(risk) {
            const likelihoodMap = { low: 1, medium: 3, high: 5, critical: 7 };
            const impactMap = { low: 1, medium: 3, high: 5, critical: 7 };
            const likelihood = risk && risk.likelihood ? String(risk.likelihood).toLowerCase() : 'medium';
            const impact = risk && risk.impact ? String(risk.impact).toLowerCase() : 'medium';
            const l = likelihoodMap[likelihood] || 3;
            const i = impactMap[impact] || 3;
            return Math.max(1, Math.min(10, Math.round((l * i) / 2.5)));
          }

          const assessed = risks.length ? risks.map(function(r) {
            const name = r && r.name ? String(r.name) : (r ? String(r) : 'Unnamed Risk');
            const domain = domains.find(function(d) { return name.toLowerCase().includes(String(d).toLowerCase()); }) || 'General';
            const likelihood = r && r.likelihood ? String(r.likelihood) : 'medium';
            const impact = r && r.impact ? String(r.impact) : 'medium';
            const score = computeScore(r);
            const mitigation = r && r.mitigation ? String(r.mitigation) : 'To be defined';
            const owner = r && r.owner ? String(r.owner) : 'Unassigned';
            return { name, domain, likelihood, impact, score, mitigation, owner, status: 'identified' };
          }) : domains.map(function(d) { return { name: String(d) + ' Risk', domain: String(d), likelihood: 'medium', impact: 'medium', score: 5, mitigation: 'To be assessed', owner: 'Unassigned', status: 'identified' }; });

          const highPriority = assessed.filter(function(r) { return r.score >= 7; });
          const summaryLines = [
            'Risk Assessment Summary',
            '=======================',
            '',
            'Timeframe: ' + (context.timeframe || 'unspecified'),
            'Domains assessed: ' + domains.join(', '),
            'Total risks identified: ' + assessed.length,
            'High-priority risks (score >= 7): ' + highPriority.length,
            '',
          ];

          if (highPriority.length > 0) {
            summaryLines.push('High-priority risks:');
            highPriority.forEach(function(r) {
              summaryLines.push('  - ' + r.name + ' (' + r.domain + ') — Likelihood: ' + r.likelihood + ', Impact: ' + r.impact + ', Score: ' + r.score + '/10');
              summaryLines.push('    Owner: ' + r.owner + ', Mitigation: ' + r.mitigation);
            });
            summaryLines.push('');
          }

          summaryLines.push('All assessed risks:');
          assessed.forEach(function(r) {
            summaryLines.push('  - ' + r.name + ' (' + r.domain + ') — Likelihood: ' + r.likelihood + ', Impact: ' + r.impact + ', Score: ' + r.score + '/10, Owner: ' + r.owner);
          });

          const reportBody = summaryLines.join(NL);

          result = {
            focusArea: 'risk-assessment',
            context,
            risks: assessed,
            riskRegister: highPriority,
            summary: 'Risk assessment complete. ' + highPriority.length + ' high-priority risks identified.',
          };

          present = [
            { id: 'summary', title: 'Executive Risk Assessment', kind: 'text', body: reportBody },
          ];
          break;
        }

        case 'scenario-modeler': {
          const scenarios = Array.isArray(input.scenarios) ? input.scenarios : [];
          const baseMetrics = input.baseMetrics && typeof input.baseMetrics === 'object' ? input.baseMetrics : {};

          if (!scenarios.length && Object.keys(baseMetrics).length === 0) {
            return fail('not-connected', 'Not connected: no scenarios supplied and no base metrics provided for modeling', 'Input required');
          }

          const modeled = scenarios.length ? scenarios.map(function(s) {
            const name = s && s.name ? String(s.name) : (s ? String(s) : 'Unnamed Scenario');
            const assumptions = s && s.assumptions && typeof s.assumptions === 'object' ? s.assumptions : {};
            const probability = s && s.probability !== undefined && s.probability !== null ? Number(s.probability) : null;
            const impact = s && s.impact ? s.impact : (Object.keys(baseMetrics).length > 0 ? { derivedFrom: 'baseMetrics', metrics: baseMetrics } : null);
            const projectedOutcome = s && s.projectedOutcome ? s.projectedOutcome : (Object.keys(baseMetrics).length > 0 ? { note: 'Projection requires scenario-specific assumptions', baseMetrics: baseMetrics } : null);
            const sensitivity = Array.isArray(s.sensitivity) ? s.sensitivity : [];
            const response = s && s.response ? String(s.response) : 'No response plan defined';
            return { name, assumptions, probability, impact, projectedOutcome, sensitivity, response };
          }) : [{ name: 'Baseline Scenario', assumptions: {}, probability: 1, projectedOutcome: baseMetrics, response: 'Baseline plan' }];

          const summaryLines = [
            'Scenario Modeling Summary',
            '=========================',
            '',
            'Timeframe: ' + (context.timeframe || 'unspecified'),
            'Scenarios modeled: ' + modeled.length,
            '',
          ];

          modeled.forEach(function(s, i) {
            summaryLines.push((i + 1) + '. ' + s.name);
            summaryLines.push('   Assumptions: ' + (Object.keys(s.assumptions).length ? JSON.stringify(s.assumptions) : 'none'));
            summaryLines.push('   Probability: ' + (s.probability !== null ? s.probability : 'not specified'));
            summaryLines.push('   Impact: ' + (s.impact ? JSON.stringify(s.impact) : 'not specified'));
            summaryLines.push('   Projected Outcome: ' + (s.projectedOutcome ? JSON.stringify(s.projectedOutcome) : 'not specified'));
            summaryLines.push('   Sensitivity: ' + (s.sensitivity.length ? s.sensitivity.join(', ') : 'none'));
            summaryLines.push('   Response: ' + s.response);
            summaryLines.push('');
          });

          const reportBody = summaryLines.join(NL);

          result = {
            focusArea: 'scenario-modeler',
            context,
            scenarios: modeled,
            baseMetrics,
            summary: 'Scenario modeling complete for ' + modeled.length + ' scenarios.',
          };

          present = [
            { id: 'summary', title: 'Executive Scenario Modeling', kind: 'text', body: reportBody },
          ];
          break;
        }

        default:
          return fail('error', 'Unknown focusArea: ' + focusArea, 'Invalid focusArea');
      }

      store.push(result);
      ctx.store.save('risk-scenario', store);

      return { success: true, status: 'ok', data: result, error: null, present };
    }
  });
RISK_SCENARIO.configSchema = RISK_SCENARIO_CONFIG;

RISK_SCENARIO.configSchema = RISK_SCENARIO_CONFIG;
withUxMetadata(RISK_SCENARIO.inputSchema as SchemaRecord);
if (RISK_SCENARIO.configSchema) withUxMetadata(RISK_SCENARIO.configSchema);