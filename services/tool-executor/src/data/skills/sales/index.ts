import { Tool } from '../../../types';
import { createCodeSkill, createExternalActionSkill } from '../code-skill-factory';

const SALES_EXTERNAL_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean', description: 'Whether the operation succeeded' },
    mode: { type: 'string', enum: ['dry-run', 'live', 'error'] },
    system: { type: 'string' },
    action: { type: 'string' },
    request: {
      type: ['object', 'null'],
      properties: {
        input: { type: 'object' },
        endpoint: { type: 'string' },
        method: { type: 'string' },
        headers: { type: 'object' },
      },
    },
    response: {
      type: ['object', 'null'],
      properties: {
        status: { type: 'number' },
        data: { type: ['object', 'string', 'null'] },
      },
    },
    error: { type: ['string', 'null'] },
  },
  required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'],
};

const SALES_SKILLS: Tool[] = [
  createCodeSkill({
    id: 'score-leads',
    name: 'Score Leads',
    description: 'Score and rank leads based on engagement, firmographics, and behavioral signals using a configurable scoring model.',
    manifest: {
      language: 'javascript',
      entrypoint: 'index.js',
      sourceCode: `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');

const leads = Array.isArray(input.leads) ? input.leads : [];
const weights = input.weights || {
  demographic: 0.3,
  firmographic: 0.25,
  engagement: 0.25,
  behavioral: 0.2,
};
const threshold = input.threshold || 50;
const baseDir = process.env.SALES_HOME || path.join('/tmp/sales');
const storePath = path.join(baseDir, 'leads.json');
fs.mkdirSync(baseDir, { recursive: true });

const defaultCriteria = {
  demographic: {
    titleSeniority: { c_level: 20, vp: 18, director: 15, manager: 10, individual: 5, unknown: 0 },
    industry: { tech: 15, finance: 15, healthcare: 14, manufacturing: 12, retail: 10, other: 5 },
  },
  firmographic: {
    companySize: { enterprise: 20, mid_market: 15, smb: 10, unknown: 0 },
    annualRevenue: {
      ranges: [
        { max: 10, score: 2 },
        { max: 100, score: 5 },
        { max: 1000, score: 10 },
        { max: Infinity, score: 15 },
      ],
    },
  },
  engagement: {
    emailOpened: 5,
    emailClicked: 10,
    linkClicked: 10,
    demoBooked: 25,
    contentDownloaded: 15,
    webinarAttended: 10,
  },
  behavioral: {
    pageVisits7d: { perVisit: 2, max: 10 },
    productPageVisits: { perVisit: 3, max: 15 },
    pricingVisited: 15,
    competitorVisited: -10,
    daysSinceLastEngagement: { decayPerDay: 0.5, maxDecay: 10 },
  },
};

function getScore(criteria, value) {
  if (criteria[value] !== undefined) return criteria[value];
  return 0;
}

function getRangeScore(ranges, value) {
  for (const r of ranges) {
    if (value <= r.max) return r.score;
  }
  return 0;
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

const scoredLeads = leads.map((lead, i) => {
  const scores = {
    demographic: 0,
    firmographic: 0,
    engagement: 0,
    behavioral: 0,
  };

  // Demographic scoring
  const title = (lead.title || '').toLowerCase();
  const seniority = Object.keys(defaultCriteria.demographic.titleSeniority).find((k) => title.includes(k));
  scores.demographic += getScore(defaultCriteria.demographic.titleSeniority, seniority || 'unknown');

  const industry = (lead.industry || 'other').toLowerCase();
  scores.demographic += getScore(defaultCriteria.demographic.industry, industry.includes('tech') || industry.includes('software') ? 'tech' : industry || 'other');

  // Firmographic scoring
  const companySize = lead.companySize || 'unknown';
  scores.firmographic += getScore(defaultCriteria.firmographic.companySize, companySize);

  const revenue = lead.annualRevenue;
  if (typeof revenue === 'number') {
    scores.firmographic += getRangeScore(defaultCriteria.firmographic.annualRevenue.ranges, revenue);
  }

  // Engagement scoring
  const engagement = lead.engagement || {};
  Object.keys(engagement).forEach((key) => {
    if (engagement[key] && defaultCriteria.engagement[key]) {
      scores.engagement += defaultCriteria.engagement[key];
    }
  });

  // Behavioral scoring
  const behavioral = lead.behavioral || {};
  if (Array.isArray(behavioral.pageVisits7d)) {
    let visitScore = (behavioral.pageVisits7d.length || 0) * defaultCriteria.behavioral.pageVisits7d.perVisit;
    visitScore = clamp(visitScore, 0, defaultCriteria.behavioral.pageVisits7d.max);
    scores.behavioral += visitScore;
  }
  if (Array.isArray(behavioral.productPageVisits)) {
    let prodScore = (behavioral.productPageVisits.length || 0) * defaultCriteria.behavioral.productPageVisits.perVisit;
    prodScore = clamp(prodScore, 0, defaultCriteria.behavioral.productPageVisits.max);
    scores.behavioral += prodScore;
  }
  if (behavioral.pricingVisited === true) {
    scores.behavioral += defaultCriteria.behavioral.pricingVisited;
  }
  if (behavioral.competitorVisited === true) {
    scores.behavioral += defaultCriteria.behavioral.competitorVisited;
  }
  if (behavioral.daysSinceLastEngagement && typeof behavioral.daysSinceLastEngagement === 'number') {
    const decay = clamp(behavioral.daysSinceLastEngagement * defaultCriteria.behavioral.daysSinceLastEngagement.decayPerDay, 0, defaultCriteria.behavioral.daysSinceLastEngagement.maxDecay);
    scores.behavioral -= decay;
  }

  scores.behavioral = Math.round(scores.behavioral);

  const totalScore = clamp(
    Math.round(scores.demographic * weights.demographic +
      scores.firmographic * weights.firmographic +
      scores.engagement * weights.engagement +
      scores.behavioral * weights.behavioral),
    0, 100
  );

  let category = 'cold';
  if (totalScore >= 70) category = 'hot';
  else if (totalScore >= 40) category = 'warm';
  else if (totalScore >= threshold) category = 'warm';

  return {
    leadId: lead.id || ('lead_' + i),
    company: lead.company || '',
    name: lead.name || '',
    title: lead.title || '',
    totalScore,
    scores,
    category,
    recommendedAction: category === 'hot' ? 'prioritize_immediate' : category === 'warm' ? 'nurture_engage' : 'monitor_score',
    isQualified: totalScore >= threshold,
  };
});

const existing = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];
fs.writeFileSync(storePath, JSON.stringify(scoredLeads, null, 2));

const hotLeads = scoredLeads.filter((l) => l.category === 'hot');
const warmLeads = scoredLeads.filter((l) => l.category === 'warm');
const coldLeads = scoredLeads.filter((l) => l.category === 'cold');

console.log(JSON.stringify({
  success: true,
  data: {
    scoredLeads,
    hotLeads,
    warmLeads,
    coldLeads,
    total: scoredLeads.length,
    hotCount: hotLeads.length,
    warmCount: warmLeads.length,
    coldCount: coldLeads.length,
    threshold,
    storePath,
  },
}));
`,
    },
    inputSchema: {
      type: 'object',
      properties: {
        leads: { type: 'array', items: { type: 'object' }, description: 'Array of lead objects with demographic, firmographic, engagement, and behavioral data' },
        weights: { type: 'object', description: 'Weight configuration for scoring dimensions (demographic, firmographic, engagement, behavioral)' },
        threshold: { type: 'number', description: 'Minimum score to be considered qualified (default: 50)' },
      },
      required: ['leads'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        scoredLeads: { type: 'array', description: 'Leads with scores and categories' },
        hotLeads: { type: 'array', description: 'High-scoring (hot) leads ready for immediate follow-up' },
        warmLeads: { type: 'array', description: 'Medium-scoring (warm) leads for nurturing' },
        coldLeads: { type: 'array', description: 'Low-scoring (cold) leads for monitoring' },
        total: { type: 'number' },
        threshold: { type: 'number' },
        storePath: { type: 'string' },
      },
      required: ['success', 'scoredLeads', 'total', 'storePath'],
    },
  }),
  createCodeSkill({
    id: 'forecast-sales',
    name: 'Forecast Sales',
    description: 'Generate a sales forecast from pipeline data using weighted pipeline stages, velocity analysis, and quota attainment projections.',
    manifest: {
      language: 'javascript',
      entrypoint: 'index.js',
      sourceCode: `
const input = __tool_input || {};

const opportunities = Array.isArray(input.opportunities) ? input.opportunities : [];
const quota = input.quota || 0;
const period = input.period || 'Q4';
const stageWeights = input.stageWeights || {
  prospect: 0.05,
  qualified: 0.15,
  demo_scheduled: 0.25,
  proposal: 0.5,
  negotiation: 0.75,
  closed_won: 1.0,
  closed_lost: 0.0,
};
const velocityDays = input.velocityDays || 30;

function round2(n) { return Math.round(n * 100) / 100; }

const totalPipeline = opportunities.reduce((sum, opp) => sum + (Number(opp.value) || 0), 0);
const weightedPipeline = opportunities.reduce((sum, opp) => {
  const stage = opp.stage || 'qualified';
  const weight = stageWeights[stage] !== undefined ? stageWeights[stage] : 0.25;
  return sum + (Number(opp.value) || 0) * weight;
}, 0);

const stageBreakdown = {};
opportunities.forEach((opp) => {
  const stage = opp.stage || 'qualified';
  if (!stageBreakdown[stage]) {
    stageBreakdown[stage] = { count: 0, totalValue: 0, weightedValue: 0 };
  }
  stageBreakdown[stage].count += 1;
  stageBreakdown[stage].totalValue += Number(opp.value) || 0;
  stageBreakdown[stage].weightedValue += (Number(opp.value) || 0) * (stageWeights[stage] !== undefined ? stageWeights[stage] : 0.25);
});

const wonOpps = opportunities.filter((o) => o.stage === 'closed_won');
const lostOpps = opportunities.filter((o) => o.stage === 'closed_lost');
const winRate = opportunities.length > 0 ? round2(wonOpps.length / opportunities.length) : 0;
const avgDealSize = wonOpps.length > 0 ? round2(wonOpps.reduce((s, o) => s + Number(o.value), 0) / wonOpps.length) : 0;

const conversionRates = {};
Object.keys(stageBreakdown).forEach((stage) => {
  const nextStage = stage === 'prospect' ? 'qualified' : stage === 'qualified' ? 'demo_scheduled' : stage === 'demo_scheduled' ? 'proposal' : stage === 'proposal' ? 'negotiation' : stage === 'negotiation' ? 'closed_won' : null;
  if (nextStage && stageBreakdown[nextStage]) {
    conversionRates[stage] = round2(stageBreakdown[nextStage].count / stageBreakdown[stage].count);
  }
});

const projectedRevenue = round2(weightedPipeline);
const quotaAttainment = quota > 0 ? round2((projectedRevenue / quota) * 100) : 0;

const velocity = opportunities.length > 0 ? round2(weightedPipeline / (opportunities.length / 30)) : 0;

const forecast = {
  id: 'forecast_' + Date.now(),
  period,
  totalOpportunities: opportunities.length,
  totalPipelineValue: round2(totalPipeline),
  weightedPipelineValue: projectedRevenue,
  forecastedRevenue: projectedRevenue,
  quota,
  quotaAttainment,
  winRate,
  avgDealSize,
  conversionRates,
  stageBreakdown,
  velocity,
  velocityDays,
  trends: {
    pipelineCoverage: quota > 0 ? round2(totalPipeline / quota) : 0,
    weightedCoverage: quota > 0 ? round2(weightedPipeline / quota) : 0,
    dealSlippageRisk: opportunities.filter((o) => {
      const stage = o.stage || '';
      const daysInStage = o.daysInStage || 0;
      return stage === 'negotiation' && daysInStage > velocityDays;
    }).length,
  },
  recommendations: [
    quotaAttainment < 80 ? 'Pipeline is below quota; focus on negotiation-stage opportunities and increase prospecting.' : null,
    winRate < 0.3 ? 'Low win rate detected; review deal qualification criteria.' : null,
    quotaAttainment >= 100 ? 'On track to exceed quota; shift focus to upselling and expansion.' : null,
  ].filter((r) => r !== null),
  createdAt: new Date().toISOString(),
  source: 'algorithmic',
};

console.log(JSON.stringify({ success: true, data: { forecast, storePath: null } }));
return forecast;
`,
    },
    inputSchema: {
      type: 'object',
      properties: {
        opportunities: { type: 'array', items: { type: 'object' }, description: 'Array of opportunity objects with value, stage, and other deal data' },
        quota: { type: 'number', description: 'Revenue quota for the forecast period' },
        period: { type: 'string', description: 'Forecast period (e.g., Q4, FY2026, October)' },
        stageWeights: { type: 'object', description: 'Probability weights per pipeline stage' },
        velocityDays: { type: 'number', description: 'Average number of days opportunities spend in a stage' },
      },
      required: ['opportunities'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        forecast: { type: 'object', description: 'The generated sales forecast with weighted pipeline, quota attainment, and recommendations' },
        weightedPipelineValue: { type: 'number' },
        forecastedRevenue: { type: 'number' },
        quotaAttainment: { type: 'number' },
      },
      required: ['success', 'forecast', 'forecastedRevenue', 'quotaAttainment'],
    },
  }),
];

const SALES_EXTERNAL_SKILLS: Tool[] = [
  createExternalActionSkill({
    id: 'sales-crm',
    name: 'CRM Integration',
    description: 'Sync leads, contacts, accounts, opportunities, and activities with an external CRM system (e.g., Salesforce, HubSpot).',
    system: 'CRM',
    action: 'sync',
    endpoint: { envVar: 'SALES_CRM_ENDPOINT', method: 'POST' },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: { accessToken: { envVar: 'SALES_CRM_ACCESS_TOKEN' } },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'CRM system base URL' },
        accessToken: { type: 'string', description: 'OAuth access token or API key' },
        provider: { type: 'string', enum: ['salesforce', 'hubspot', 'pipedrive', 'custom'] },
        defaultOwnerId: { type: 'string', description: 'Default owner ID for records' },
        leadSources: { type: 'object', description: 'Configured lead source mappings' },
        opportunityStages: { type: 'array', items: { type: 'string' }, description: 'Standardized opportunity pipeline stages' },
        activitySync: { type: 'object', description: 'Activity synchronization settings' },
        duplicateHandling: { type: 'object', description: 'Duplicate detection and merge rules' },
      },
      required: ['baseUrl'],
    },
    credentialSource: {
      accessToken: { envVar: 'SALES_CRM_ACCESS_TOKEN', configKey: 'crm.accessToken' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['create', 'read', 'update', 'delete', 'sync'], description: 'CRM operation to perform' },
        entity: { type: 'string', enum: ['lead', 'contact', 'account', 'opportunity', 'activity'], description: 'Type of CRM entity' },
        data: { type: 'object', description: 'Data payload for create/update operations' },
        filters: { type: 'object', description: 'Filters for read/query operations' },
        entityId: { type: 'string', description: 'Unique identifier of the entity' },
      },
      required: ['operation', 'entity'],
    },
    outputSchema: SALES_EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 30000,
  }),
  createExternalActionSkill({
    id: 'sales-email-outreach',
    name: 'Email Outreach',
    description: 'Draft, send, and track sales outreach emails with templated sequences, scheduling, and engagement tracking.',
    system: 'email',
    action: 'send-outreach',
    endpoint: { envVar: 'SALES_EMAIL_ENDPOINT', method: 'POST' },
    auth: {
      type: 'api_key',
      header: 'Authorization',
      credentialEnvKeyMap: { apiKey: { envVar: 'SALES_EMAIL_API_KEY' } },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Email service base URL' },
        apiKey: { type: 'string', description: 'Email service API key' },
        provider: { type: 'string', enum: ['sendgrid', 'mailgun', 'ses', 'brevo', 'custom'] },
        fromAddress: { type: 'string', description: 'Default sender email address' },
        fromName: { type: 'string', description: 'Default sender name' },
        templates: { type: 'object', description: 'Email template configurations' },
        sequences: { type: 'array', items: { type: 'object' }, description: 'Email sequence definitions' },
        trackingSettings: { type: 'object', description: 'Email tracking and analytics settings' },
        complianceRules: { type: 'array', items: { type: 'string' }, description: 'Email compliance rules (GDPR, CAN-SPAM)' },
      },
      required: ['baseUrl', 'apiKey'],
    },
    credentialSource: {
      apiKey: { envVar: 'SALES_EMAIL_API_KEY', configKey: 'email.apiKey' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['send', 'draft', 'schedule', 'track', 'list'], description: 'Email outreach operation to perform' },
        to: { type: 'array', items: { type: 'string' }, description: 'Recipient email addresses' },
        subject: { type: 'string', description: 'Email subject line' },
        htmlBody: { type: 'string', description: 'HTML email body content' },
        textBody: { type: 'string', description: 'Plain text email body content' },
        templateId: { type: 'string', description: 'Pre-defined email template identifier' },
        templateData: { type: 'object', description: 'Variables to populate the selected template' },
        sequenceId: { type: 'string', description: 'ID of the email sequence to use' },
        leadId: { type: 'string', description: 'Associated lead identifier' },
        scheduledAt: { type: 'string', description: 'ISO 8601 timestamp for scheduled send' },
        replyTo: { type: 'string', description: 'Reply-to email address' },
        endpointUrl: { type: 'string', description: 'Override endpoint URL for this specific request' },
      },
      required: ['operation'],
    },
    outputSchema: SALES_EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 30000,
  }),
  createExternalActionSkill({
    id: 'sales-analytics',
    name: 'Sales Analytics',
    description: 'Query sales metrics, pipeline trends, forecast accuracy, and performance reports from an analytics platform.',
    system: 'analytics',
    action: 'query',
    endpoint: { envVar: 'SALES_ANALYTICS_ENDPOINT', method: 'POST' },
    auth: {
      type: 'api_key',
      header: 'X-API-Key',
      credentialEnvKeyMap: { apiKey: { envVar: 'SALES_ANALYTICS_API_KEY' } },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Analytics platform base URL' },
        apiKey: { type: 'string', description: 'Analytics platform API key' },
        provider: { type: 'string', enum: ['salesforce-wave', 'hubspot-reports', 'looker', 'tableau', 'custom'] },
        reportTemplates: { type: 'array', items: { type: 'object' }, description: 'Pre-configured report templates' },
        dashboardLayouts: { type: 'object', description: 'Dashboard layout configurations' },
        cohortDefinitions: { type: 'array', items: { type: 'object' }, description: 'Cohort analysis definitions' },
        forecastModels: { type: 'array', items: { type: 'object' }, description: 'Forecasting model configurations' },
        alertConfigs: { type: 'object', description: 'Alert and notification settings' },
      },
      required: ['baseUrl', 'apiKey'],
    },
    credentialSource: {
      apiKey: { envVar: 'SALES_ANALYTICS_API_KEY', configKey: 'analytics.apiKey' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        metric: { type: 'string', description: 'Sales metric or report name to retrieve (e.g., pipeline_velocity, quota_attainment, win_rate)' },
        dateRange: { type: 'object', description: 'Date range for the analysis, e.g. { start: "2024-01-01", end: "2024-12-31" }', properties: { start: { type: 'string', description: 'Start date (ISO 8601)' }, end: { type: 'string', description: 'End date (ISO 8601)' } } },
        dimensions: { type: 'array', items: { type: 'string' }, description: 'Dimensions to group the metric by (e.g., rep, region, product)' },
        filters: { type: 'object', description: 'Filter conditions as key-value pairs' },
        granularity: { type: 'string', enum: ['day', 'week', 'month', 'quarter'], description: 'Time granularity for the data' },
        reps: { type: 'array', items: { type: 'string' }, description: 'Specific sales reps to include in the analysis' },
        endpointUrl: { type: 'string', description: 'Override endpoint URL for this request' },
      },
      required: ['metric'],
    },
    outputSchema: SALES_EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    id: 'sales-meeting-assistant',
    name: 'Meeting Assistant',
    description: 'Schedule sales meetings, generate and send calendar invites, transcribe calls, and extract action items.',
    system: 'meeting',
    action: 'manage',
    endpoint: { envVar: 'SALES_MEETING_ENDPOINT', method: 'POST' },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: { accessToken: { envVar: 'SALES_MEETING_ACCESS_TOKEN' } },
    },
    configSchema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string', description: 'OAuth access token for calendar integration' },
        provider: { type: 'string', enum: ['google', 'outlook', 'calendly', 'custom'] },
        defaultCalendarId: { type: 'string', description: 'Default calendar ID for scheduling' },
        timezone: { type: 'string', description: 'Default timezone for scheduling' },
        meetingTemplates: { type: 'object', description: 'Pre-configured meeting type templates' },
        transcriptionProvider: { type: 'string', description: 'Transcription service provider' },
        recordingSettings: { type: 'object', description: 'Call recording and consent settings' },
        actionItemConfig: { type: 'object', description: 'Action item extraction configuration' },
      },
      required: ['accessToken'],
    },
    credentialSource: {
      accessToken: { envVar: 'SALES_MEETING_ACCESS_TOKEN', configKey: 'meeting.accessToken' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['schedule', 'reschedule', 'cancel', 'transcribe', 'action_items'], description: 'Meeting operation to perform' },
        leadId: { type: 'string', description: 'Lead identifier associated with the meeting' },
        subject: { type: 'string', description: 'Meeting subject or title' },
        startTime: { type: 'string', description: 'ISO 8601 start time for the meeting' },
        duration: { type: 'number', description: 'Meeting duration in minutes' },
        attendees: { type: 'array', items: { type: 'string' }, description: 'Attendee email addresses' },
        meetingType: { type: 'string', enum: ['discovery', 'demo', 'proposal', 'followup', 'negotiation'], description: 'Type of sales meeting' },
        recordingUrl: { type: 'string', description: 'URL to audio/video recording for transcription' },
        transcript: { type: 'string', description: 'Transcript text for action item extraction' },
        endpointUrl: { type: 'string', description: 'Override endpoint URL for this request' },
      },
      required: ['operation'],
    },
    outputSchema: SALES_EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 45000,
  }),
  createExternalActionSkill({
    id: 'sales-proposal-generator',
    name: 'Proposal Generator',
    description: 'Generate, customize, and send sales proposals and quotes through a configurable document system.',
    system: 'proposal',
    action: 'generate',
    endpoint: { envVar: 'SALES_PROPOSAL_ENDPOINT', method: 'POST' },
    auth: {
      type: 'api_key',
      header: 'X-API-Key',
      credentialEnvKeyMap: { apiKey: { envVar: 'SALES_PROPOSAL_API_KEY' } },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Proposal/document system base URL' },
        apiKey: { type: 'string', description: 'API key for authentication' },
        provider: { type: 'string', enum: ['pandadoc', 'proposify', 'quoter', 'custom'] },
        templates: { type: 'object', description: 'Proposal template configurations' },
        pricingTables: { type: 'object', description: 'Pricing table configurations' },
        signatureSettings: { type: 'object', description: 'E-signature integration settings' },
        approvalWorkflow: { type: 'object', description: 'Internal approval workflow rules' },
      },
      required: ['baseUrl', 'apiKey'],
    },
    credentialSource: {
      apiKey: { envVar: 'SALES_PROPOSAL_API_KEY', configKey: 'proposal.apiKey' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['create', 'send', 'status', 'signatures'], description: 'Proposal operation to perform' },
        leadId: { type: 'string', description: 'Associated lead identifier' },
        opportunityId: { type: 'string', description: 'Associated opportunity identifier' },
        templateId: { type: 'string', description: 'Template identifier to use' },
        templateData: { type: 'object', description: 'Dynamic data to merge into the template' },
        lineItems: { type: 'array', items: { type: 'object' }, description: 'Line items for the proposal/quote' },
        totalAmount: { type: 'number', description: 'Total amount for the proposal' },
        validUntil: { type: 'string', description: 'Expiration date for the proposal (ISO 8601)' },
        recipientEmails: { type: 'array', items: { type: 'string' }, description: 'Email addresses to send the proposal to' },
        endpointUrl: { type: 'string', description: 'Override endpoint URL for this request' },
      },
      required: ['operation'],
    },
    outputSchema: SALES_EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 30000,
  }),
];

export const salesSkills = [...SALES_SKILLS, ...SALES_EXTERNAL_SKILLS];
