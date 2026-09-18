import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const LEAD_DEAL_ADVISORY_SOURCE = `const input = __tool_input || {};
const fs = require('fs');
const path = require('path');
const operation = input.operation || 'score-leads';
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

if (operation === 'score-leads') {
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
  console.log(JSON.stringify({ success: true, data: { scoredLeads, hotLeads, warmLeads, coldLeads, total: scoredLeads.length, hotCount: hotLeads.length, warmCount: warmLeads.length, coldCount: coldLeads.length, threshold, storePath, rationale: summary } }));
}

if (operation === 'forecast') {
  const opportunities = Array.isArray(input.opportunities) ? input.opportunities : [];
  const quota = input.quota || 0;
  const period = input.period || 'Q4';
  const storePath = path.join(baseDir, 'forecast.json');
  const totalPipeline = opportunities.reduce((sum, opp) => sum + (Number(opp.value) || 0), 0);
  const weightedPipeline = opportunities.reduce((sum, opp) => { const stage = opp.stage || 'qualified'; const weight = stageWeights[stage] !== undefined ? stageWeights[stage] : 0.25; return sum + (Number(opp.value) || 0) * weight; }, 0);
  const stageBreakdown = {};
  opportunities.forEach((opp) => { const stage = opp.stage || 'qualified'; if (!stageBreakdown[stage]) { stageBreakdown[stage] = { count: 0, totalValue: 0, weightedValue: 0 }; } stageBreakdown[stage].count += 1; stageBreakdown[stage].totalValue += Number(opp.value) || 0; stageBreakdown[stage].weightedValue += (Number(opp.value) || 0) * (stageWeights[stage] !== undefined ? stageWeights[stage] : 0.25); });
  const wonOpps = opportunities.filter((o) => o.stage === 'closed_won');
  const winRate = opportunities.length > 0 ? round2(wonOpps.length / opportunities.length) : 0;
  const avgDealSize = wonOpps.length > 0 ? round2(wonOpps.reduce((s, o) => s + Number(o.value), 0) / wonOpps.length) : 0;
  const projectedRevenue = round2(weightedPipeline);
  const quotaAttainment = quota > 0 ? round2((projectedRevenue / quota) * 100) : 0;
  const pipelineCoverage = quota > 0 ? round2(totalPipeline / quota) : 0;
  const weightedCoverage = quota > 0 ? round2(weightedPipeline / quota) : 0;
  const dealSlippageRisk = opportunities.filter((o) => o.stage === 'negotiation' && (o.daysInStage || 0) > velocityDays).length;
  const recommendations = [];
  if (quotaAttainment < 80) recommendations.push('Pipeline below quota; prioritize negotiation-stage deals and increase prospecting.');
  if (winRate < 0.3) recommendations.push('Low win rate; review deal qualification criteria.');
  if (pipelineCoverage < 2) recommendations.push('Pipeline coverage below 2x quota; add net-new opps.');
  if (dealSlippageRisk > 0) recommendations.push(dealSlippageRisk + ' deal(s) at risk of slippage in negotiation.');
  if (quotaAttainment >= 100) recommendations.push('On track to exceed quota; focus on upsell and expansion.');
  if (recommendations.length === 0) recommendations.push('Pipeline health looks strong; continue current momentum.');
  const rationale = 'Forecast for ' + period + ': weighted=' + projectedRevenue + ' vs quota ' + quota + ' (' + quotaAttainment + '% attainment). Coverage=' + pipelineCoverage + 'x, win rate=' + winRate + ', avg deal=' + avgDealSize + '.';
  const forecast = { id: 'forecast_' + Date.now(), period, totalOpportunities: opportunities.length, totalPipelineValue: round2(totalPipeline), weightedPipelineValue: projectedRevenue, forecastedRevenue: projectedRevenue, quota, quotaAttainment, winRate, avgDealSize, conversionRates: {}, stageBreakdown, velocity: opportunities.length > 0 ? round2(weightedPipeline / (opportunities.length / 30)) : 0, velocityDays, trends: { pipelineCoverage, weightedCoverage, dealSlippageRisk }, recommendations, rationale, createdAt: new Date().toISOString(), source: 'algorithmic' };
  fs.writeFileSync(storePath, JSON.stringify(forecast, null, 2));
  console.log(JSON.stringify({ success: true, data: { forecast, storePath, rationale: rationale + ' Recommendations: ' + recommendations.join(' ') } }));
}`;

const LEAD_DEAL_ADVISORY = createCodeSkill({
  id: 'lead-deal-advisory',
  name: 'Lead & Deal Advisory',
  description: 'Score and rank leads with per-dimension rationale, and generate weighted sales forecasts with quota-attainment interpretation and deal-level recommendations. Runs reasoning-only on local data; no external API required.',
  manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: LEAD_DEAL_ADVISORY_SOURCE },
  inputSchema: {
    type: 'object',
    properties: {
      operation: SchemaProps.select(['score-leads', 'forecast'], { description: 'Advisory operation to perform' }),
      leads: SchemaProps.objectArray(SchemaProps.object({
        id: SchemaProps.text({ description: 'Lead identifier' }), name: SchemaProps.text({ description: 'Lead name' }), company: SchemaProps.text({ description: 'Company name' }), title: SchemaProps.text({ description: 'Lead title or seniority' }), industry: SchemaProps.text({ description: 'Lead industry' }), companySize: SchemaProps.text({ description: 'Company size tier' }), annualRevenue: SchemaProps.number({ description: 'Annual revenue' }), engagement: SchemaProps.object({}, { description: 'Engagement signals for the lead' }), behavioral: SchemaProps.object({}, { description: 'Behavioral signals for the lead' }),
      }, { description: 'Lead scoring input' }), { description: 'Array of lead objects' }),
      weights: SchemaProps.object({ demographic: SchemaProps.number({ description: 'Weight for demographic signals' }), firmographic: SchemaProps.number({ description: 'Weight for firmographic signals' }), engagement: SchemaProps.number({ description: 'Weight for engagement signals' }), behavioral: SchemaProps.number({ description: 'Weight for behavioral signals' }) }, { description: 'Weight configuration for scoring dimensions' }),
      threshold: SchemaProps.number({ description: 'Minimum score to be considered qualified (default: 50)', default: 50 }),
      opportunities: SchemaProps.objectArray(SchemaProps.object({ id: SchemaProps.text({ description: 'Opportunity identifier' }), value: SchemaProps.number({ description: 'Opportunity value' }), stage: SchemaProps.text({ description: 'Pipeline stage' }), daysInStage: SchemaProps.number({ description: 'Days the opportunity has spent in its current stage' }) }, { description: 'Opportunity forecasting input' }), { description: 'Array of opportunity objects' }),
      quota: SchemaProps.number({ description: 'Revenue quota for the forecast period' }),
      period: SchemaProps.text({ description: 'Forecast period (e.g., Q4, FY2026)' }),
      stageWeights: SchemaProps.object({}, { description: 'Probability weights per pipeline stage' }),
      velocityDays: SchemaProps.number({ description: 'Average days opportunities spend in a stage', default: 30 }),
    },
    required: ['operation'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      operation: { type: 'string' },
      data: { type: 'object', description: 'Scored leads or forecast with recommendations and rationale' },
      storePath: { type: 'string' },
      error: { type: 'string' },
    },
    required: ['success', 'operation', 'data'],
  },
  triggers: [
    { kind: 'user', phrase_examples: ['Score these leads', 'Rank my leads', 'Forecast this quarter', 'Which leads should I prioritize'] },
    { kind: 'schedule', cadence: 'Daily lead scoring refresh' },
    { kind: 'schedule', cadence: 'Weekly forecast update' },
    { kind: 'schedule', cadence: 'Weekly pipeline review' },
    { kind: 'event', on: 'New lead captured' },
    { kind: 'event', on: 'Lead moved to CRM' },
    { kind: 'event', on: 'Deal stage changed' },
    { kind: 'event', on: 'Deal closed-won' },
    { kind: 'event', on: 'Deal closed-lost' },
    { kind: 'event', on: 'Pipeline coverage below 2x' },
    { kind: 'event', on: 'Win rate drops' },
  ],
});

export { LEAD_DEAL_ADVISORY };
