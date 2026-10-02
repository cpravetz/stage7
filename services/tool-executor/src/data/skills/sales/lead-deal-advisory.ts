// @ts-nocheck
import { Tool, SchemaRecord } from '../../../types';
import { createDeclarativeCodeSkill, SchemaProps, createSchemaRecord } from '../code-skill-factory';
import { salesResultSchema } from './sales-contract';

/**
 * Lead scoring is a deterministic function of the supplied lead data.
 *
 * Every dimension is normalized against its own documented maximum before the weighted sum, so the
 * total is a genuine 0-100 score. The previous version applied the weights to raw point totals
 * whose per-dimension maxima differ, which capped the achievable score below the hot threshold and
 * made the top band unreachable for every possible lead.
 */

const CAREER_BASE_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

const leadDealAdvisory = createDeclarativeCodeSkill({
  id: 'lead-deal-advisory',
  name: 'Lead & Deal Advisory',
  description:
    'Score and rank leads against a documented BANT-style rubric computed entirely from the lead records you supply, with per-signal rationale, explicit coverage of unassessed inputs, and an honest not-connected result when no leads are given. Local computation only; no CRM or external data source is queried.',
  persistenceEnvVar: 'SALES_HOME',
  inputSchema: createSchemaRecord({
    leads: SchemaProps.objectArray(
      SchemaProps.object(
        {
          id: SchemaProps.text({ description: 'Lead identifier' }),
          name: SchemaProps.text({ description: 'Lead name' }),
          company: SchemaProps.text({ description: 'Company name' }),
          title: SchemaProps.text({ description: 'Lead title or seniority' }),
          industry: SchemaProps.text({ description: 'Lead industry' }),
          companySize: SchemaProps.text({ description: 'Company size tier' }),
          annualRevenue: SchemaProps.number({ description: 'Annual revenue' }),
          engagement: SchemaProps.object({}, { description: 'Engagement signals; recognized keys: emailOpened, emailClicked, linkClicked, demoBooked, contentDownloaded, webinarAttended', additionalProperties: true }),
          behavioral: SchemaProps.object({}, { description: 'Behavioral signals: pageVisits7d, productPageVisits, pricingVisited, competitorVisited, daysSinceLastEngagement', additionalProperties: true }),
        },
        { description: 'Lead scoring input' },
      ),
      { description: 'Lead records to score; at least one is required' },
    ),
    weights: SchemaProps.object(
      {
        demographic: SchemaProps.number({ description: 'Weight for demographic signals' }),
        firmographic: SchemaProps.number({ description: 'Weight for firmographic signals' }),
        engagement: SchemaProps.number({ description: 'Weight for engagement signals' }),
        behavioral: SchemaProps.number({ description: 'Weight for behavioral signals' }),
      },
      { description: 'Scoring dimension weights (must sum to 1.0)', additionalProperties: false },
    ),
    threshold: SchemaProps.number({ description: 'Score at/above which a lead is "qualified"', default: 50 }),
    hotThreshold: SchemaProps.number({ description: 'Score at/above which a lead is "hot"', default: 70 }),
  }),
  outputSchema: salesResultSchema('Scored and ranked leads with per-signal rationale, unassessed coverage, and score composition'),
  manifest: {
    configSchema: createSchemaRecord({
      defaultThreshold: SchemaProps.number({ description: 'Default qualification threshold', default: 50 }),
      defaultHotThreshold: SchemaProps.number({ description: 'Default hot-lead threshold', default: 70 }),
    }),
    persistenceEnv: 'SALES_HOME',
    confirmBeforeSend: false,
    ui: { view: 'lead-deal-advisory' },
  },
  triggers: [
    { kind: 'user', phrase_examples: ['Score these leads', 'Rank my leads', 'Lead qualification'] },
  ],
  tier: 'advise',
  domainKnowledge: 'Sales qualification frameworks, lead scoring rubrics, and pipeline prioritization',
  isSkill: true,
  handler: async function (input, ctx) {
    const NL = '\n';
    const DEFAULT_WEIGHTS: Record<string, number> = { demographic: 0.3, firmographic: 0.25, engagement: 0.25, behavioral: 0.2 };
    const WEIGHT_KEYS = ['demographic', 'firmographic', 'engagement', 'behavioral'];

    const MAXIMA: Record<string, number> = {
      demographic: 35,
      firmographic: 35,
      engagement: 75,
      behavioral: 40,
    };

    const criteria = {
      demographic: {
        titleSeniority: { c_level: 20, vp: 18, director: 15, manager: 10, individual: 5, unknown: 0 },
        industry: { tech: 15, finance: 15, healthcare: 14, manufacturing: 12, retail: 10, other: 5 },
      },
      firmographic: {
        companySize: { enterprise: 20, mid_market: 15, smb: 10, unknown: 0 },
        annualRevenueRanges: [
          { max: 10, score: 2 },
          { max: 100, score: 5 },
          { max: 1000, score: 10 },
          { max: Infinity, score: 15 },
        ],
      },
      engagement: { emailOpened: 5, emailClicked: 10, linkClicked: 10, demoBooked: 25, contentDownloaded: 15, webinarAttended: 10 },
      behavioral: {
        pageVisits7d: { perVisit: 2, max: 10 },
        productPageVisits: { perVisit: 3, max: 15 },
        pricingVisited: 15,
        competitorVisited: -10,
        daysSinceLastEngagement: { decayPerDay: 0.5, maxDecay: 10 },
      },
    };

    const ENGAGEMENT_POINTS = criteria.engagement as Record<string, number>;
    const ENGAGEMENT_KEYS = Object.keys(ENGAGEMENT_POINTS);

    function clamp(n: number, min: number, max: number): number { return Math.max(min, Math.min(max, n)); }
    function getRangeScore(ranges: Array<{ max: number; score: number }>, value: number): number {
      for (const r of ranges) { if (value <= r.max) return r.score; }
      return 0;
    }

    function matchSeniority(title: string) {
      const normalized = String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (!normalized) return { key: 'unknown', points: 0 };
      const words = normalized.split(/\s+/);
      if (words.some((w) => w === 'c' || w === 'chief' || w === 'ceo' || w === 'cto' || w === 'cfo' || w === 'cmo')) {
        return { key: 'c_level', points: criteria.demographic.titleSeniority.c_level };
      }
      if (normalized.indexOf('vice president') >= 0 || words.indexOf('vp') >= 0 || words.indexOf('svp') >= 0 || words.indexOf('evp') >= 0) {
        return { key: 'vp', points: criteria.demographic.titleSeniority.vp };
      }
      if (normalized.indexOf('director') >= 0) return { key: 'director', points: criteria.demographic.titleSeniority.director };
      if (normalized.indexOf('manager') >= 0 || normalized.indexOf('head of') >= 0) return { key: 'manager', points: criteria.demographic.titleSeniority.manager };
      if (words.indexOf('individual') >= 0 || words.indexOf('contributor') >= 0) return { key: 'individual', points: criteria.demographic.titleSeniority.individual };
      return { key: 'unknown', points: 0 };
    }

    function matchIndustry(industry: string) {
      const value = String(industry || '').toLowerCase();
      if (!value) return { key: 'other', points: criteria.demographic.industry.other, matched: 'default' };
      const table = criteria.demographic.industry;
      if (value.indexOf('tech') >= 0 || value.indexOf('software') >= 0 || value.indexOf('saas') >= 0) return { key: 'tech', points: table.tech };
      if (value.indexOf('financ') >= 0 || value.indexOf('bank') >= 0 || value.indexOf('insur') >= 0) return { key: 'finance', points: table.finance };
      if (value.indexOf('health') >= 0 || value.indexOf('medic') >= 0 || value.indexOf('clinic') >= 0) return { key: 'healthcare', points: table.healthcare };
      if (value.indexOf('manufactur') >= 0 || value.indexOf('industrial') >= 0) return { key: 'manufacturing', points: table.manufacturing };
      if (value.indexOf('retail') >= 0 || value.indexOf('commerce') >= 0) return { key: 'retail', points: table.retail };
      return { key: 'other', points: table.other, matched: 'fallback' };
    }

    function normalizeCompanySize(size: string) {
      const value = String(size || '').toLowerCase().trim();
      if (!value) return { key: 'unknown', points: 0 };
      if (value.indexOf('enterprise') >= 0) return { key: 'enterprise', points: criteria.firmographic.companySize.enterprise };
      if (value.indexOf('mid') >= 0) return { key: 'mid_market', points: criteria.firmographic.companySize.mid_market };
      if (value.indexOf('smb') >= 0 || value.indexOf('small') >= 0) return { key: 'smb', points: criteria.firmographic.companySize.smb };
      return { key: 'unknown', points: 0 };
    }

    const leads = Array.isArray(input.leads) ? input.leads : [];
    const threshold = typeof input.threshold === 'number' ? input.threshold : 50;
    const hotThreshold = typeof input.hotThreshold === 'number' ? input.hotThreshold : 70;
    const suppliedWeights = input.weights && typeof input.weights === 'object' ? input.weights : {};
    const weights: Record<string, number> = {};
    WEIGHT_KEYS.forEach((key) => {
      weights[key] = typeof suppliedWeights[key] === 'number' ? suppliedWeights[key] : DEFAULT_WEIGHTS[key];
    });

    if (leads.length === 0) {
      const lines = [
        'No leads were supplied, so nothing could be scored.',
        '',
        'Send one or more lead objects in the leads array. Each lead can carry:',
        '  - title, industry, companySize, annualRevenue',
        '  - engagement signals: ' + ENGAGEMENT_KEYS.join(', '),
        '  - behavioral signals: pageVisits7d, productPageVisits, pricingVisited, competitorVisited, daysSinceLastEngagement',
        '',
        'Every score is computed from the values you supply. No lead data is fetched from an external source.',
      ];
      return {
        success: false,
        status: 'not-connected',
        data: { scoredLeads: [], total: 0, missingInformation: ['leads'] },
        error: 'Not connected: no lead records were supplied, so no scoring was performed',
        present: [{ id: 'notice', title: 'No lead data to score', kind: 'text', body: lines.join(NL) }],
      };
    }

    const scored = leads.map(function (lead: any, index: number) {
      lead = lead && typeof lead === 'object' ? lead : {};
      const contributions: string[] = [];

      const seniority = matchSeniority(lead.title);
      const industry = matchIndustry(lead.industry);
      const demographicPoints = seniority.points + industry.points;
      contributions.push('Seniority "' + (lead.title || 'not supplied') + '" matched ' + seniority.key + ' (+' + seniority.points + ')');
      contributions.push('Industry "' + (lead.industry || 'not supplied') + '" matched ' + industry.key + ' (+' + industry.points + ')');

      const size = normalizeCompanySize(lead.companySize);
      let firmographicPoints = size.points;
      contributions.push('Company size "' + (lead.companySize || 'not supplied') + '" matched ' + size.key + ' (+' + size.points + ')');
      if (typeof lead.annualRevenue === 'number') {
        const revenueScore = getRangeScore(criteria.firmographic.annualRevenueRanges, lead.annualRevenue);
        firmographicPoints += revenueScore;
        contributions.push('Annual revenue ' + lead.annualRevenue + ' fell in the band worth +' + revenueScore);
      } else {
        contributions.push('Annual revenue not supplied, scored 0 on this signal');
      }

      const engagement = lead.engagement && typeof lead.engagement === 'object' ? lead.engagement : {};
      const matchedEngagement: string[] = [];
      const ignoredEngagement: string[] = [];
      let engagementPoints = 0;
      ENGAGEMENT_KEYS.forEach(function (key) {
        if (engagement[key] === true) {
          engagementPoints += ENGAGEMENT_POINTS[key];
          matchedEngagement.push(key + ' (+' + ENGAGEMENT_POINTS[key] + ')');
        }
      });
      Object.keys(engagement).forEach(function (key) {
        if (ENGAGEMENT_KEYS.indexOf(key) < 0) ignoredEngagement.push(key);
      });
      if (matchedEngagement.length) contributions.push('Engagement signals present: ' + matchedEngagement.join(', '));
      else contributions.push('No recognized engagement signals were set');
      if (ignoredEngagement.length) contributions.push('Ignored unrecognized engagement fields: ' + ignoredEngagement.join(', '));

      const behavioral = lead.behavioral && typeof lead.behavioral === 'object' ? lead.behavioral : {};
      let behavioralPoints = 0;
      if (Array.isArray(behavioral.pageVisits7d)) {
        const gained = clamp(behavioral.pageVisits7d.length * criteria.behavioral.pageVisits7d.perVisit, 0, criteria.behavioral.pageVisits7d.max);
        behavioralPoints += gained;
        contributions.push(behavioral.pageVisits7d.length + ' page visit(s) in the last 7 days (+' + gained + ')');
      }
      if (Array.isArray(behavioral.productPageVisits)) {
        const gained = clamp(behavioral.productPageVisits.length * criteria.behavioral.productPageVisits.perVisit, 0, criteria.behavioral.productPageVisits.max);
        behavioralPoints += gained;
        contributions.push(behavioral.productPageVisits.length + ' product page visit(s) (+' + gained + ')');
      }
      if (behavioral.pricingVisited === true) {
        behavioralPoints += criteria.behavioral.pricingVisited;
        contributions.push('Visited the pricing page (+' + criteria.behavioral.pricingVisited + ')');
      }
      if (behavioral.competitorVisited === true) {
        behavioralPoints += criteria.behavioral.competitorVisited;
        contributions.push('Visited a competitor page (' + criteria.behavioral.competitorVisited + ')');
      }
      if (typeof behavioral.daysSinceLastEngagement === 'number') {
        const decay = clamp(behavioral.daysSinceLastEngagement * criteria.behavioral.daysSinceLastEngagement.decayPerDay, 0, criteria.behavioral.daysSinceLastEngagement.maxDecay);
        behavioralPoints -= decay;
        contributions.push(behavioral.daysSinceLastEngagement + ' day(s) since last engagement (' + '-' + decay + ')');
      }

      const raw: Record<string, number> = {
        demographic: demographicPoints,
        firmographic: firmographicPoints,
        engagement: engagementPoints,
        behavioral: behavioralPoints,
      };
      const normalized: Record<string, number> = {};
      WEIGHT_KEYS.forEach(function (key) {
        normalized[key] = Math.round((clamp(raw[key], 0, MAXIMA[key]) / MAXIMA[key]) * 100);
      });

      let weighted = 0;
      WEIGHT_KEYS.forEach(function (key) { weighted += normalized[key] * weights[key]; });
      const totalScore = Math.round(clamp(weighted, 0, 100));

      let category = 'cold';
      let recommendedAction = 'monitor_score';
      if (totalScore >= hotThreshold) {
        category = 'hot';
        recommendedAction = 'prioritize_immediate';
      } else if (totalScore >= threshold) {
        category = 'warm';
        recommendedAction = 'nurture_engage';
      }

      const unassessed: string[] = [];
      if (typeof lead.annualRevenue !== 'number') unassessed.push('annualRevenue');
      if (matchedEngagement.length === 0) unassessed.push('engagement');
      if (!Array.isArray(behavioral.pageVisits7d) && !Array.isArray(behavioral.productPageVisits)) unassessed.push('site activity');

      return {
        leadId: lead.id || ('lead_' + (index + 1)),
        company: lead.company || 'not supplied',
        name: lead.name || 'not supplied',
        title: lead.title || 'not supplied',
        totalScore: totalScore,
        category: category,
        isQualified: totalScore >= threshold,
        recommendedAction: recommendedAction,
        scores: raw,
        normalizedScores: normalized,
        weights: weights,
        matchedSignals: { seniority: seniority.key, industry: industry.key, companySize: size.key, engagement: matchedEngagement },
        unassessedInputs: unassessed,
        rationale: contributions,
      };
    });

    scored.sort(function (a: any, b: any) { return b.totalScore - a.totalScore; });

    const hot = scored.filter(function (l: any) { return l.category === 'hot'; });
    const warm = scored.filter(function (l: any) { return l.category === 'warm'; });
    const cold = scored.filter(function (l: any) { return l.category === 'cold'; });

    ctx.store.save('leads', scored);
    const storePath = ctx.store.getFilePath('leads');

    const lines: string[] = [];
    lines.push('Scored ' + scored.length + ' lead' + (scored.length === 1 ? '' : 's') + ' from the data you supplied, ranked highest first.');
    lines.push('');
    lines.push('Score composition: each dimension is normalized against its own maximum, then combined using the weights below.');
    lines.push('  ' + WEIGHT_KEYS.map(function (k) { return k + ' ' + Math.round(weights[k] * 100) + '%'; }).join(', '));
    lines.push('  Qualification threshold: ' + threshold + '   Hot threshold: ' + hotThreshold);
    lines.push('');
    lines.push('Hot: ' + hot.length + '   Warm: ' + warm.length + '   Cold: ' + cold.length);
    lines.push('');

    scored.forEach(function (lead: any, i: number) {
      lines.push((i + 1) + '. ' + lead.name + ' — ' + lead.company + ' (' + lead.title + ')');
      lines.push('   Score ' + lead.totalScore + '/100 — ' + lead.category.toUpperCase() + ' — ' + lead.recommendedAction.replace(/_/g, ' '));
      lines.push('   Demographic ' + lead.scores.demographic + '/' + MAXIMA.demographic
        + ', Firmographic ' + lead.scores.firmographic + '/' + MAXIMA.firmographic
        + ', Engagement ' + lead.scores.engagement + '/' + MAXIMA.engagement
        + ', Behavioral ' + lead.scores.behavioral + '/' + MAXIMA.behavioral);
      lead.rationale.forEach(function (line: string) { lines.push('   - ' + line); });
      if (lead.unassessedInputs.length) {
        lines.push('   Not assessed: ' + lead.unassessedInputs.join(', '));
      }
      lines.push('');
    });

    const allUnassessed: Record<string, number> = {};
    scored.forEach(function (lead: any) {
      lead.unassessedInputs.forEach(function (key: string) { allUnassessed[key] = (allUnassessed[key] || 0) + 1; });
    });
    const unassessedKeys = Object.keys(allUnassessed);
    if (unassessedKeys.length) {
      lines.push('Coverage: scoring used only the fields present in your input. Missing across the set:');
      unassessedKeys.forEach(function (key) { lines.push('  - ' + key + ': absent on ' + allUnassessed[key] + ' of ' + scored.length + ' lead(s)'); });
    } else {
      lines.push('Coverage: every lead supplied the full signal set, so no lead is partially scored.');
    }
    lines.push('');
    lines.push('Scope: these scores are computed locally from the lead records you provided. No CRM,');
    lines.push('enrichment service, or market data source was queried, and no forecast is implied.');

    return {
      success: true,
      status: 'ok',
      data: {
        scoredLeads: scored,
        hotLeads: hot,
        warmLeads: warm,
        coldLeads: cold,
        total: scored.length,
        hotCount: hot.length,
        warmCount: warm.length,
        coldCount: cold.length,
        threshold: threshold,
        hotThreshold: hotThreshold,
        weights: weights,
        dimensionMaxima: MAXIMA,
        unassessedCoverage: allUnassessed,
        storePath: storePath,
        persisted: true,
        source: 'local-computation',
      },
      present: [ctx.render.text('report', 'Lead qualification', lines)],
    };
  },
});
leadDealAdvisory.configSchema = leadDealAdvisory.manifest.configSchema as SchemaRecord;

export { leadDealAdvisory, leadDealAdvisory as LEAD_DEAL_ADVISORY };
