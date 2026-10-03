// @ts-nocheck
import { SchemaProps, createDeclarativeCodeSkill, createSchemaRecord } from '../../../adk/code-skill-factory';
import { ARCH_DEBT_TRIGGERS } from '../cto-contract';

export const CTO_ARCHITECTURE_TECH_DEBT_EVALUATOR = createDeclarativeCodeSkill({
    id: 'cto-architecture-tech-debt-evaluator',
    name: 'Architecture & Tech Debt Evaluator',
    description: 'Evaluate supplied system health scores and produce a prioritized architecture modernization roadmap.',
    persistenceEnvVar: 'CTO_HOME',
    inputSchema: createSchemaRecord({
      systems: SchemaProps.objectArray(SchemaProps.object({
        name: SchemaProps.text({ description: 'System or service name' }),
        reliability: SchemaProps.number({ description: 'Reliability score from 0 to 5' }),
        security: SchemaProps.number({ description: 'Security posture score from 0 to 5' }),
        scalability: SchemaProps.number({ description: 'Scalability score from 0 to 5' }),
        maintainability: SchemaProps.number({ description: 'Maintainability score from 0 to 5' }),
        cost: SchemaProps.number({ description: 'Cost pressure score from 0 to 5' }),
      }), { description: 'System health and trade-off inputs' }),
      requirements: SchemaProps.objectArray(SchemaProps.text({}), { description: 'Requirements to evaluate per system' }),
      context: SchemaProps.object({}, { description: 'Additional context passed to underlying architecture advisory', additionalProperties: true }),
    }, { required: ['systems'] }),
    outputSchema: createSchemaRecord({
      success: SchemaProps.boolean({ description: 'Whether evaluation completed' }),
      data: SchemaProps.object({}, { description: 'Scored systems and prioritized roadmap' }),
      error: SchemaProps.text({ description: 'Failure message' }),
      present: SchemaProps.objectArray(SchemaProps.object({
        id: SchemaProps.text({}),
        title: SchemaProps.text({}),
        kind: SchemaProps.text({}),
        body: SchemaProps.text({}),
      }), { description: 'Pre-formatted user-facing output blocks' }),
    }),
    triggers: ARCH_DEBT_TRIGGERS,
    tier: 'advise',
    domainKnowledge: 'Architecture pattern analysis, technology stack fit scoring, and modernization roadmap prioritization',
    manifest: {
      ui: { view: 'architecture-roadmap' }
    },
    handler: async function handler(input, ctx) {
        const systems = Array.isArray(input.systems) ? input.systems : [];
        if (!systems.length) {
          const result = { success: false, error: 'Not connected: no system health inputs were supplied', data: {} };

          return result;
        }
        const evaluated = [];
        const errors = [];
        for (const system of systems) {
          try {
            const result = await ctx.delegate('cto-architecture-advisory', {
              system: system.name || 'unnamed',
              requirements: Array.isArray(input.requirements) ? input.requirements : [],
              context: Object.assign({}, input.context || {}, {
                teamSize: system.teamSize || 0,
                currentStack: system.currentStack || [],
                constraints: system.constraints || [],
                timeline: system.timeline || '',
                scale: system.scale || '',
              }),
            });
            if (result && result.success === false) {
              errors.push({ system: system.name || 'unknown', error: result.error || 'Underlying tool returned failure' });
            }
            evaluated.push(result);
          } catch (e) {
            errors.push({ system: system.name || 'unknown', error: e instanceof Error ? e.message : String(e) });
          }
        }
        const scored = systems.map((system) => {
          const s = typeof system === 'object' ? system : {};
          const weights = { reliability: 3, security: 3, scalability: 2, maintainability: 2, cost: 1 };
          const score = Object.keys(weights).reduce((sum, key) => sum + Number(s[key] || 0) * weights[key], 0);
          return { name: s.name, score, priority: score >= 18 ? 'high' : score >= 12 ? 'medium' : 'low' };
        }).sort((a, b) => b.score - a.score);
        const roadmap = scored.map((item, index) => ({
          rank: index + 1,
          ...item,
          action: item.priority === 'high' ? 'modernize now' : item.priority === 'medium' ? 'schedule next quarter' : 'monitor',
        }));
        const result = { success: true, data: { systems: scored, roadmap, evaluations: evaluated, generatedAt: new Date().toISOString() }, error: errors.length ? errors : null };
        const reportLines = [
          'Architecture & Tech Debt Evaluation',
          'Systems Evaluated: ' + systems.length,
          '',
          'Prioritized Roadmap:',
        ];
        roadmap.forEach((item) => {
          reportLines.push('  ' + item.rank + '. ' + item.name + ' — Score: ' + item.score + ' (' + item.priority.toUpperCase() + ') — ' + item.action);
        });
        if (errors.length) {
          reportLines.push('', 'Errors from underlying evaluations:');
          errors.forEach((e, i) => {
            reportLines.push('  ' + (i + 1) + '. ' + e.system + ': ' + e.error);
          });
        }

        return result;
      }
    });
