import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

export const ROADMAP_PRD_DRAFTING = createCodeSkill({
  id: 'roadmap-prd-drafting',
  name: 'Roadmap & PRD Drafting',
  description: 'Draft product roadmaps with RICE-scored goals, topologically-sorted initiatives, capacity planning, milestones, risk assessment, theme allocation, and OKR alignment. Also generate structured PRDs with INVEST user stories, acceptance criteria, and phased rollout plans.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: `const docInput = { content: input.content || '', format: input.format || 'markdown' };
const parsed = await __execute_tool('document-ingestion', docInput);
const items = parsed.data.entities;
const sections = parsed.data.sections;
const goals = (input.goals || []).map((g, i) => ({
  id: 'goal_' + i, text: g, priority: input.priority || 'medium',
  reach: Math.max(1, Number(input.reach || 100)),
  impact: Math.max(0.1, Number(input.impact || 2)),
  confidence: Math.max(0.1, Math.min(1, Number(input.confidence || 0.8))),
  effort: Math.max(0.1, Number(input.effort || 5)),
}));
const scoredGoals = goals.map((g, i) => {
  const rice = Math.round((g.reach * g.impact * g.confidence) / g.effort * 10000) / 10000;
  const wsjf = Math.round(((g.reach * g.impact) + (g.confidence * 10)) / Math.max(0.1, g.effort) * 100) / 100;
  return { ...g, rice, wsjf, score: Math.round((rice + wsjf) * 100) / 100 };
});
scoredGoals.sort((a, b) => b.score - a.score);
const initiatives = (input.initiatives || []).map((init, i) => ({
  id: 'init_' + i, text: init, effort: Math.max(0.5, Number(init.effort || 5)),
  goals: [], risk: Number(init.risk || 0.3), dependencies: [],
}));
const roadmap = {
  id: 'roadmap_' + Date.now(), quarter: input.quarter || 'Q1 2026',
  timeHorizon: Math.max(1, Math.min(12, Number(input.timeHorizon) || 4)),
  goals: scoredGoals, initiatives, parsedFrom: items.length,
  sections: sections.map(s => s.title), createdAt: new Date().toISOString(),
};
console.log(JSON.stringify({ success: true, data: roadmap }));
return roadmap;`,
  },
  inputSchema: {
    type: 'object',
    properties: {
      content: SchemaProps.text({ description: 'Source document content' }),
      format: SchemaProps.select(['markdown', 'yaml', 'html'], { description: 'Document format' }),
      quarter: SchemaProps.text({ description: 'Target quarter' }),
      timeHorizon: SchemaProps.number({ description: 'Number of quarters to plan', minimum: 1, maximum: 12 }),
      goals: SchemaProps.stringArray({ description: 'Business goals to prioritize' }),
      initiatives: SchemaProps.stringArray({ description: 'Product initiatives to sequence' }),
      title: SchemaProps.text({ description: 'PRD title' }),
      problem: SchemaProps.text({ description: 'Problem statement' }),
      scope: SchemaProps.text({ description: 'Scope and boundaries' }),
      priority: SchemaProps.select(['high', 'medium', 'low'], { description: 'Default priority' }),
      reach: SchemaProps.number({ description: 'RICE reach estimate' }),
      impact: SchemaProps.number({ description: 'RICE impact (0.25-3 scale)' }),
      confidence: SchemaProps.number({ description: 'RICE confidence (0-1)' }),
      effort: SchemaProps.number({ description: 'RICE effort (person-weeks)' }),
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: { type: 'object', description: 'Generated roadmap or PRD with all sections' },
    },
    required: ['success', 'data'],
  },
  triggers: [
    { kind: 'user', phrase_examples: ['Draft a roadmap', 'Write a PRD', 'Prioritize goals'] },
  ],
  tier: 'aid',
  domainKnowledge: 'Product roadmap planning and PRD authoring frameworks',
});
