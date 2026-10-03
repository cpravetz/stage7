// @ts-nocheck
import { SchemaProps, createDeclarativeCodeSkill, createSchemaRecord } from '../../../adk/code-skill-factory';

export const CTO_ARCHITECTURE_ADVISORY = (() => { const t = createDeclarativeCodeSkill({
  id: 'cto-architecture-advisory',
  name: 'Architecture & Tech Stack Advisory',
  description: 'Reasoning-based architectural guidance and tech stack recommendations',
  persistenceEnvVar: 'CTO_HOME',
  manifest: {
    reasoningConfig: {
      model: 'gpt-4',
      temperature: 0.3,
      maxTokens: 4000,
    },
  },
  inputSchema: createSchemaRecord({
    system: SchemaProps.text({
      description: 'Name or description of the system being architected',
      required: true,
    }),
    requirements: SchemaProps.objectArray(SchemaProps.text({}), {
      description: 'List of functional and non-functional requirements',
      minItems: 1,
    }),
    context: SchemaProps.object({
      teamSize: SchemaProps.integer({ description: 'Number of engineers on the team' }),
      currentStack: SchemaProps.stringArray({ description: 'Currently used technologies' }),
      constraints: SchemaProps.stringArray({ description: 'Technical, budget, or organizational constraints' }),
      timeline: SchemaProps.text({ description: 'Expected timeline for implementation' }),
      scale: SchemaProps.text({ description: 'Expected scale (users, requests, data volume)' }),
    }, {
      description: 'Additional context for the advisory',
      additionalProperties: true,
    }),
  }, { required: ['system', 'requirements'] }),
  outputSchema: createSchemaRecord({
    success: SchemaProps.boolean({ description: 'Whether the advisory completed' }),
    system: SchemaProps.text({ description: 'System that was analyzed' }),
    requirements: SchemaProps.objectArray(SchemaProps.text({}), { description: 'Requirements that were considered' }),
    context: SchemaProps.object({}, { description: 'Context that was provided', additionalProperties: true }),
    result: SchemaProps.object({
      recommendations: SchemaProps.objectArray(SchemaProps.object({
        category: SchemaProps.text({}),
        suggestion: SchemaProps.text({}),
        rationale: SchemaProps.text({}),
        priority: SchemaProps.select(['high', 'medium', 'low'], {}),
        effort: SchemaProps.select(['low', 'medium', 'high'], {}),
      }), {}),
      risks: SchemaProps.objectArray(SchemaProps.object({
        area: SchemaProps.text({}),
        description: SchemaProps.text({}),
        mitigation: SchemaProps.text({}),
      }), {}),
      decisions: SchemaProps.objectArray(SchemaProps.object({
        topic: SchemaProps.text({}),
        decision: SchemaProps.text({}),
        alternatives: SchemaProps.stringArray({}),
      }), {}),
    }, { description: 'Structured advisory output', additionalProperties: true }),
    error: SchemaProps.text({ description: 'Error message if failed' }),
    present: SchemaProps.objectArray(SchemaProps.object({
      id: SchemaProps.text({}),
      title: SchemaProps.text({}),
      kind: SchemaProps.text({}),
      body: SchemaProps.text({}),
    }), { description: 'Pre-formatted user-facing output blocks' }),
  }),
  tier: 'advise',
  domainKnowledge: 'System design patterns, technology stack trade-offs, scalability boundaries, and architecture review criteria',
  handler: async function handler(input, ctx) {
    const system = input.system;
    const requirements = input.requirements || [];
    const context = input.context || {};

    if (!system) {
      return { success: false, system, requirements: [], context, result: { recommendations: [], risks: [], decisions: [] }, error: 'Missing required system parameter' };
    }

    const reqList = Array.isArray(requirements) ? requirements : [];
    const teamSize = context.teamSize || 0;
    const currentStack = Array.isArray(context.currentStack) ? context.currentStack : [];
    const constraints = Array.isArray(context.constraints) ? context.constraints : [];
    const timeline = context.timeline || '';
    const scale = context.scale || '';

    const recommendations = reqList.map((req, i) => ({
      category: 'architecture',
      suggestion: 'Evaluate ' + req + ' for ' + system,
      rationale: 'Requirement ' + (i + 1) + ' of ' + reqList.length + ' for system: ' + system,
      priority: i === 0 ? 'high' : 'medium',
      effort: 'medium',
    }));

    const risks = constraints.map((c, i) => ({
      area: 'constraints',
      description: 'Constraint: ' + c,
      mitigation: 'Review and address constraint ' + (i + 1),
    }));

    const decisions = [];

    if (teamSize > 0) {
      recommendations.push({
        category: 'team',
        suggestion: 'Team size of ' + teamSize + ' supports ' + system,
        rationale: 'Team capacity assessment based on team size parameter',
        priority: 'medium',
        effort: 'medium',
      });
    }

    return { success: true, system, requirements: reqList, context, result: { recommendations, risks, decisions, teamSize, currentStack, timeline, scale } };
  },
  }); (t as any).isSkill = false; return t; })();
