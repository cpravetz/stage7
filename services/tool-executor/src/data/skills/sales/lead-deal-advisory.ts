import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const LEAD_DEAL_ADVISORY_SOURCE = `const input = __tool_input || {};
const fs = require('fs');
const path = require('path');
const baseDir = process.env.SALES_HOME || path.join('/tmp/sales');
const weights = input.weights || { demographic: 0.3, firmographic: 0.25, engagement: 0.25, behavioral: 0.2 };
const threshold = input.threshold || 50;
const stageWeights = input.stageWeights || { prospect: 0.05, qualified: 0.15, demo_scheduled: 0.25, proposal: 0.5, negotiation: 0.75, closed_won: 1.0, closed_lost: 0.0 };
const velocityDays = input.velocityDays || 30;
function getScore(c, v) { return c && c[v] !== undefined ? c[v] : 0; }
function getRangeScore(ranges, value) { for (const r of ranges) { if (value <= r.max) return r.score; } return 0; }
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function round2(n) { return Math.round(n * 100) / 100; }
const criteria = {
  demographic: { titleSeniority: { c_level: 20, vp: 18, director: 15, manager: 10, individual: 5, unknown: 0 }, industry: { tech: 15, finance: 15, healthcare: 14, manufacturing: 12, retail: 10, other: 5 } },
  firmographic: { companySize: { enterprise: 20, mid_market: 15, smb: 10, unknown: 0 }, annualRevenue: { ranges: [ { max: 10, score: 2 }, { max: 100, score: 5 }, { max: 1000, score: 10 }, { max: Infinity, score: 15 } ] } },
  engagement: { emailOpened: 5, emailClicked: 10, linkClicked: 10, demoBooked: 25, contentDownloaded: 15, webinarAttended: 10 },
  behavioral: { pageVisits7d: { perVisit: 2, max: 10 }, productPageVisits: { perVisit: 3, max: 15 }, pricingVisited: 15, competitorVisited: -10, daysSinceLastEngagement: { decayPerDay: 0.5, maxDecay: 10 } },
};
fs.mkdirSync(baseDir, { recursive: true });

const leads = Array.isArray(input.leads) ? input.leads : [];
const storePath = path.join(baseDir, 'leads.json');
const scoredLeads = leads.map((lead, i) => {
  const scores = { demographic: 0, firmographic: 0, engagement: 0, behavioral: 0 };
  const title = (lead.title || '').toLowerCase();
  scores.demographic += getScore(criteria.demographic.titleSeniority, Object.keys(criteria.demographic.titleSeniority).find((k) => title.includes(k)) || 'unknown');
  const industry = (lead.industry || 'other').toLowerCase();
  scores.demographic += getScore(criteria.demographic.industry, (industry.includes('tech') || industry.includes('software')) ? 'tech' : industry || 'other');
  scores.firmographic += getScore(criteria.firmographic.companySize, lead.companySize || 'unknown');
  if (typeof lead.annualRevenue === 'number') { scores.firmographic += getRangeScore(criteria.firmographic.annualRevenue.ranges, lead.annualRevenue); }
  const engagement = lead.engagement || {};
  Object.keys(engagement).forEach((k) => { if (engagement[k] && criteria.engagement[k]) { scores.engagement += criteria.engagement[k]; } });
  const behavioral = lead.behavioral || {};
  if (Array.isArray(behavioral.pageVisits7d)) { scores.behavioral += clamp((behavioral.pageVisits7d.length || 0) * criteria.behavioral.pageVisits7d.perVisit, 0, criteria.behavioral.pageVisits7d.max); }
  if (Array.isArray(behavioral.productPageVisits)) { scores.behavioral += clamp((behavioral.productPageVisits.length || 0) * criteria.behavioral.productPageVisits.perVisit, 0, criteria.behavioral.productPageVisits.max); }
  if (behavioral.pricingVisited === true) { scores.behavioral += criteria.behavioral.pricingVisited; }
  if (behavioral.competitorVisited === true) { scores.behavioral += criteria.behavioral.competitorVisited; }
  if (behavioral.daysSinceLastEngagement && typeof behavioral.daysSinceLastEngagement === 'number') {
    scores.behavioral -= clamp(behavioral.daysSinceLastEngagement * criteria.behavioral.daysSinceLastEngagement.decayPerDay, 0, criteria.behavioral.daysSinceLastEngagement.maxDecay);
  }
  scores.behavioral = Math.round(scores.behavioral);
  const totalScore = clamp(Math.round(scores.demographic * weights.demographic + scores.firmographic * weights.firmographic + scores.engagement * weights.engagement + scores.behavioral * weights.behavioral), 0, 100);
  let category = 'cold';
  if (totalScore >= 70) category = 'hot';
  else if (totalScore >= threshold) category = 'warm';
  const rationale = [];
  rationale.push('Demographic=' + scores.demographic + ', Firmographic=' + scores.firmographic + ', Engagement=' + scores.engagement + ', Behavioral=' + scores.behavioral + '.');
  if (scores.engagement >= 15) rationale.push('Recent engagement (' + scores.engagement + ' pts) indicates active interest.');
  if (totalScore < threshold) rationale.push('Below qualification threshold (' + threshold + '); continue monitoring.');
  else rationale.push('Above threshold (' + threshold + '); ' + (category === 'hot' ? 'prioritize immediately' : 'nurture with targeted outreach') + '.');
  return { leadId: lead.id || ('lead_' + i), company: lead.company || '', name: lead.name || '', title: lead.title || '', totalScore, scores, category, rationale: rationale.join(' '), recommendedAction: category === 'hot' ? 'prioritize_immediate' : category === 'warm' ? 'nurture_engage' : 'monitor_score', isQualified: totalScore >= threshold };
});
fs.writeFileSync(storePath, JSON.stringify(scoredLeads, null, 2));
const hotLeads = scoredLeads.filter((l) => l.category === 'hot'), warmLeads = scoredLeads.filter((l) => l.category === 'warm'), coldLeads = scoredLeads.filter((l) => l.category === 'cold');
const summary = 'Scored ' + scoredLeads.length + ' leads using weights ' + JSON.stringify(weights) + '. Hot=' + hotLeads.length + ', Warm=' + warmLeads.length + ', Cold=' + coldLeads.length + '.';
console.log(JSON.stringify({ success: true, data: { scoredLeads, hotLeads, warmLeads, coldLeads, total: scoredLeads.length, hotCount: hotLeads.length, warmCount: warmLeads.length, coldCount: coldLeads.length, threshold, storePath, rationale: summary } }));`;

const LEAD_DEAL_ADVISORY = createCodeSkill({
  id: 'lead-deal-advisory',
  name: 'Lead & Deal Advisory',
  description: 'Score and rank leads with per-dimension rationale, and generate weighted sales forecasts with quota-attainment interpretation and deal-level recommendations. Runs reasoning-only on local data; no external API required.',
  tier: 'advise',
  domainKnowledge: 'Sales methodology, lead scoring frameworks, and revenue forecasting',
  manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: LEAD_DEAL_ADVISORY_SOURCE },
  inputSchema: {
    type: 'object',
    properties: {
      leads: SchemaProps.objectArray(SchemaProps.object({
        id: SchemaProps.text({ description: 'Lead identifier' }), name: SchemaProps.text({ description: 'Lead name' }), company: SchemaProps.text({ description: 'Company name' }), title: SchemaProps.text({ description: 'Lead title or seniority' }), industry: SchemaProps.text({ description: 'Lead industry' }), companySize: SchemaProps.text({ description: 'Company size tier' }), annualRevenue: SchemaProps.number({ description: 'Annual revenue' }), engagement: SchemaProps.object({}, { description: 'Engagement signals for the lead' }), behavioral: SchemaProps.object({}, { description: 'Behavioral signals for the lead' }),
      }, { description: 'Lead scoring input' }), { description: 'Array of lead objects' }),
      weights: SchemaProps.object({ demographic: SchemaProps.number({ description: 'Weight for demographic signals' }), firmographic: SchemaProps.number({ description: 'Weight for firmographic signals' }), engagement: SchemaProps.number({ description: 'Weight for engagement signals' }), behavioral: SchemaProps.number({ description: 'Weight for behavioral signals' }) }, { description: 'Weight configuration for scoring dimensions' }),
      threshold: SchemaProps.number({ description: 'Minimum score to be considered qualified (default: 50)', default: 50 }),
    },
    required: [],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: { type: 'object', description: 'Scored leads with rationale and recommended actions' },
      storePath: { type: 'string' },
      error: { type: 'string' },
    },
    required: ['success', 'data'],
  },
  triggers: [
    { kind: 'user', phrase_examples: ['Score these leads', 'Generate a sales forecast', 'Prioritize my deals'] },
  ],
});

export { LEAD_DEAL_ADVISORY };
