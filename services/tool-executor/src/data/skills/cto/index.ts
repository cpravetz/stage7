import { Tool } from '../../../types';
import { createExternalActionSkill } from '../code-skill-factory';

const CTO_EXTERNAL_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    success: { type: 'boolean', description: 'Whether the external action succeeded' },
    mode: { type: 'string', description: 'Execution mode: dry-run, live, or error' },
    system: { type: 'string', description: 'External system name' },
    action: { type: 'string', description: 'External action name' },
    request: {
      type: 'object',
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
    error: { type: 'string', description: 'Execution error message, when present' },
  },
  required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'],
};

/**
 * CTO / Engineering Leadership tool suite.
 *
 * Each tool is a `code`-type tool. The `manifest.sourceCode` is a JavaScript
 * string that the ToolExecutor runs inside a sandboxed node process. The
 * sandbox injects `__tool_input` (the user-supplied input object) as a global
 * before executing the script. Tools should `console.log(JSON.stringify(result))`
 * to return structured output.
 *
 * All tools share a common runtime contract:
 *   input:  { ...fields }
 *   output: { success: boolean, data?: any, error?: string, meta?: object }
 */

const CTO_TOOLS: Tool[] = [
  {
    id: 'architecture-review',
    name: 'Architecture Review',
    description: 'Perform an architecture review of a system or design, surfacing concerns, risks, and recommendations. Saves locally by default.',
    type: 'code',
    manifest: {
      language: 'javascript',
      entrypoint: 'index.js',
      sourceCode: `const input = __tool_input || {};
const fs = require('fs');
const path = require('path');

const system = input.system || '';
const requirements = input.requirements || '';
const baseDir = process.env.CTO_HOME || path.join('/tmp/cto');
const storePath = path.join(baseDir, 'architecture-reviews.json');
const patternsPath = process.env.CTO_ARCH_PATTERNS_PATH || path.join('/mnt/1tbHD/ckt_web/stage7/services/tool-executor/src/data/skills/cto', 'architecture-patterns.json');

fs.mkdirSync(baseDir, { recursive: true });

var patternsData = { patterns: [], technologies: [], concerns: [], recommendations: {} };
if (fs.existsSync(patternsPath)) {
  try { patternsData = JSON.parse(fs.readFileSync(patternsPath, 'utf8')); } catch(e) {}
}

var reqLower = requirements.toLowerCase();

// 1. Parse requirements text for architectural patterns (weighted keyword matching)
var detectedPatterns = (patternsData.patterns || []).map(function(p) {
  var score = 0;
  var matchedKeywords = [];
  for (var i = 0; i < p.keywords.length; i++) {
    if (reqLower.indexOf(p.keywords[i].toLowerCase()) !== -1) {
      score += (p.weight || 1.0);
      matchedKeywords.push(p.keywords[i]);
    }
  }
  return { id: p.id, name: p.name, description: p.description, score: score, matchedKeywords: matchedKeywords, detected: score >= (p.weight || 1.0) };
}).filter(function(p) { return p.detected; }).sort(function(a, b) { return b.score - a.score; });

// 2. Detect technologies mentioned in requirements and infer architecture style
var detectedTech = (patternsData.technologies || []).filter(function(t) {
  return t.keywords.some(function(kw) { return reqLower.indexOf(kw.toLowerCase()) !== -1; });
});

var inferredStyle = [];
var styleSet = {};
detectedTech.forEach(function(t) { if (!styleSet[t.architectureStyle]) { styleSet[t.architectureStyle] = true; inferredStyle.push(t.architectureStyle); } });
if (inferredStyle.length === 0 && detectedPatterns.length > 0) {
  detectedPatterns.forEach(function(p) { if (!styleSet[p.id]) { styleSet[p.id] = true; inferredStyle.push(p.id); } });
}
if (inferredStyle.length === 0) { inferredStyle.push('monolith'); }

// 3. Identify specific concerns based on requirements text analysis (not random)
var identifiedConcerns = (patternsData.concerns || []).map(function(c) {
  var evidence = [];
  var score = 0;
  for (var i = 0; i < c.keywords.length; i++) {
    if (reqLower.indexOf(c.keywords[i].toLowerCase()) !== -1) {
      evidence.push(c.keywords[i]);
      score += (c.weight || 1.0);
    }
  }
  var w = c.weight || 1.0;
  return {
    id: c.id, name: c.name, detected: score >= w, evidence: evidence, score: score,
    severity: score >= w * 2 ? 'critical' : score >= w ? 'high' : score >= w * 0.5 ? 'medium' : 'low'
  };
}).filter(function(c) { return c.detected; }).sort(function(a, b) { return b.score - a.score; });

// 4. Generate specific recommendations tied to found concerns
var generatedRecommendations = [];
var recsMap = patternsData.recommendations || {};
identifiedConcerns.forEach(function(c) {
  var concernRecs = recsMap[c.id] || [];
  concernRecs.forEach(function(r) {
    var desc = (r.description || '').split('{system}').join(system).split('{concern}').join(c.name.toLowerCase());
    generatedRecommendations.push({
      type: r.type || 'general', priority: r.priority || 'medium', category: r.category || 'general',
      description: desc,
      justification: 'Based on requirements text analysis - matched keywords: ' + c.evidence.join(', '),
      concernId: c.id, concernScore: c.score
    });
  });
});

// Build summary
var summary = '';
if (detectedPatterns.length > 0) {
  summary += 'Detected patterns: ' + detectedPatterns.map(function(p) { return p.name + '(' + p.score.toFixed(1) + ')'; }).join(', ') + '. ';
}
if (detectedTech.length > 0) {
  summary += 'Technologies mentioned: ' + detectedTech.map(function(t) { return t.name; }).join(', ') + '. ';
}
summary += 'Inferred architecture: ' + inferredStyle.join(', ') + '. ';
if (identifiedConcerns.length > 0) {
  summary += 'Key concerns: ' + identifiedConcerns.map(function(c) { return c.name + ' [' + c.severity + ', score=' + c.score.toFixed(1) + ']'; }).join(', ') + '.';
}

var review = {
  id: 'archreview_' + Date.now(), system: system, requirements: requirements,
  detectedPatterns: detectedPatterns, detectedTechnologies: detectedTech, inferredArchitecture: inferredStyle,
  concerns: identifiedConcerns, recommendations: generatedRecommendations, summary: summary,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: 'local',
};

var store = [];
if (fs.existsSync(storePath)) {
  try { store = JSON.parse(fs.readFileSync(storePath, 'utf8')); } catch(e) {}
}
if (!Array.isArray(store)) { store = []; }
store.push(review);
fs.writeFileSync(storePath, JSON.stringify(store, null, 2));

console.log(JSON.stringify({ success: true, data: { review, storePath } }));`
    },
    inputSchema: {
      type: 'object',
      properties: {
        system: { type: 'string', description: 'External system name' },
        requirements: { type: 'string', description: 'Architecture requirements or design document' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether the architecture review was completed successfully' },
        review: { type: 'object', description: 'The review result object with concerns, recommendations, and metadata' },
        storePath: { type: 'string', description: 'File path where the review was saved' },
      },
      required: ['success', 'review', 'storePath'],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'tech-stack-recommendation',
    name: 'Tech Stack Recommendation',
    description: 'Recommend a technology stack for a project based on scale, requirements, and constraints. Saves locally by default.',
    type: 'code',
    manifest: {
      language: 'javascript',
      entrypoint: 'index.js',
      sourceCode: `const input = __tool_input || {};
const fs = require('fs');
const path = require('path');

const project = input.project || '';
const baseDir = process.env.CTO_HOME || path.join('/tmp/cto');
const storePath = path.join(baseDir, 'tech-stack-recommendations.json');
const stacksPath = process.env.CTO_TECH_STACKS_PATH || path.join('/mnt/1tbHD/ckt_web/stage7/services/tool-executor/src/data/skills/cto', 'tech-stacks.json');

fs.mkdirSync(baseDir, { recursive: true });

var stacksData = { factors: {}, candidates: [] };
if (fs.existsSync(stacksPath)) {
  try { stacksData = JSON.parse(fs.readFileSync(stacksPath, 'utf8')); } catch(e) {}
}

var teamSkills = (input.teamSkills || []).map(function(s) { return String(s).toLowerCase(); });
var projectType = String(input.projectType || '').toLowerCase();
var scaleStr = String(input.scale || '').toLowerCase();
var constraints = input.constraints || {};
var budgetStr = String(constraints.budget || '').toLowerCase();
var complianceArr = (constraints.compliance || []).map(function(c) { return String(c).toLowerCase(); });
var infraStr = String(constraints.existingInfrastructure || '').toLowerCase();
var perfStr = String(constraints.performance || '').toLowerCase();
var ttmStr = String(constraints.timeToMarket || '').toLowerCase();

var scoredCandidates = (stacksData.candidates || []).map(function(candidate) {
  var totalWeightedScore = 0;
  var maxPossibleScore = 0;
  var factorBreakdown = {};

  var factorEntries = Object.entries(stacksData.factors || {});
  for (var fi = 0; fi < factorEntries.length; fi++) {
    var factorId = factorEntries[fi][0];
    var factor = factorEntries[fi][1];
    var weight = factor.weight || 0;
    maxPossibleScore += weight * 10;

    var inputValues = [];
    if (factorId === 'teamExpertise') { inputValues = teamSkills; }
    else if (factorId === 'projectType') { if (projectType) inputValues = [projectType]; }
    else if (factorId === 'scale') { if (scaleStr) inputValues = [scaleStr]; }
    else if (factorId === 'budget') { if (budgetStr) inputValues = [budgetStr]; }
    else if (factorId === 'compliance') { inputValues = complianceArr; }
    else if (factorId === 'infrastructure') { if (infraStr) inputValues = [infraStr]; }
    else if (factorId === 'performance') { if (perfStr) inputValues = [perfStr]; }
    else if (factorId === 'timeToMarket') { if (ttmStr) inputValues = [ttmStr]; }

    var candidateFactorScores = (candidate.factorScores && candidate.factorScores[factorId]) || {};
    var factorScore = 0;
    for (var iv = 0; iv < inputValues.length; iv++) {
      var val = inputValues[iv];
      if (candidateFactorScores[val] !== undefined) {
        factorScore += candidateFactorScores[val];
      } else {
        var ckArr = Object.keys(candidateFactorScores);
        for (var ck = 0; ck < ckArr.length; ck++) {
          if (ckArr[ck].indexOf(val) !== -1 || val.indexOf(ckArr[ck]) !== -1) {
            factorScore += candidateFactorScores[ckArr[ck]] * 0.5;
            break;
          }
        }
      }
    }

    var normalizedScore = maxPossibleScore > 0 ? (factorScore / 10) * weight * 100 : 0;
    totalWeightedScore += normalizedScore;

    factorBreakdown[factorId] = {
      rawScore: Math.round(factorScore * 100) / 100,
      weight: weight,
      contribution: Math.round(normalizedScore * 100) / 100
    };
  }

  return {
    id: candidate.id, name: candidate.name,
    frontend: candidate.frontend, backend: candidate.backend,
    database: candidate.database, hosting: candidate.hosting,
    totalScore: Math.round(totalWeightedScore * 100) / 100,
    factorBreakdown: factorBreakdown, tradeOffs: candidate.tradeOffs || [], ranked: 0
  };
});

scoredCandidates.sort(function(a, b) { return b.totalScore - a.totalScore; });
scoredCandidates.forEach(function(c, i) { c.ranked = i + 1; });

var topN = Math.min(5, scoredCandidates.length);

var recommendation = {
  id: 'stackrec_' + Date.now(), project: project, constraints: constraints,
  rankedCandidates: scoredCandidates.slice(0, topN), allCandidates: scoredCandidates,
  methodology: 'weighted multi-factor decision matrix',
  summary: 'Top recommendation: ' + (scoredCandidates[0] ? scoredCandidates[0].name : 'N/A') + ' (score: ' + (scoredCandidates[0] ? scoredCandidates[0].totalScore : 0) + '/100). ' + (scoredCandidates[1] ? 'Runner-up: ' + scoredCandidates[1].name + ' (score: ' + scoredCandidates[1].totalScore + '/100). ' : ''),
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: 'local',
};

var store = [];
if (fs.existsSync(storePath)) {
  try { store = JSON.parse(fs.readFileSync(storePath, 'utf8')); } catch(e) {}
}
if (!Array.isArray(store)) { store = []; }
store.push(recommendation);
fs.writeFileSync(storePath, JSON.stringify(store, null, 2));

console.log(JSON.stringify({ success: true, data: { recommendation, storePath } }));`
    },
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or description' },
        scale: { type: 'string', description: 'Expected scale or traffic' },
        teamSkills: { type: 'array', items: { type: 'string' }, description: 'Team technical skills and expertise' },
        projectType: { type: 'string', description: 'Project type: web, mobile, api, ml, real-time, data-intensive' },
        constraints: {
          type: 'object',
          properties: {
            budget: { type: 'string', description: 'Budget level: low, medium, high' },
            compliance: { type: 'array', items: { type: 'string' }, description: 'Compliance requirements: SOC2, HIPAA, GDPR' },
            existingInfrastructure: { type: 'string', description: 'Current cloud provider and stack' },
            performance: { type: 'string', description: 'Performance requirements' },
            timeToMarket: { type: 'string', description: 'Timeline: fast, moderate, slow' },
          },
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether the tech stack recommendation was generated successfully' },
        recommendation: { type: 'object', description: 'The recommendation with ranked candidates, factor breakdowns, and metadata' },
        storePath: { type: 'string', description: 'File path where the recommendation was saved' },
      },
      required: ['success', 'recommendation', 'storePath'],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const CTO_EXTERNAL_SKILLS: Tool[] = [
  createExternalActionSkill({
    id: 'cto-jira',
    name: 'Jira',
    description: 'Create, update, and query Jira issues and sprints. Uses configurable Jira instance with endpoint and auth.',
    system: 'jira',
    action: 'manage_issue',
    endpoint: {
      method: 'POST',
      envVar: 'CTO_JIRA_BASE_URL',
    },
    auth: {
      type: 'basic',
      credentialEnvKeyMap: {
        username: { envVar: 'CTO_JIRA_EMAIL' },
        password: { envVar: 'CTO_JIRA_API_TOKEN' },
      },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Jira base URL' },
        email: { type: 'string', description: 'Jira user email' },
        apiToken: { type: 'string', description: 'Jira API token' },
        projectKey: { type: 'string', description: 'Default Jira project key' },
        issueType: { type: 'string', description: 'Default Jira issue type' },
        customFields: { type: 'array', items: { type: 'object' }, description: 'Custom field mappings' },
        webhookUrl: { type: 'string', description: 'Webhook URL for Jira events' },
        webhookEvents: { type: 'array', items: { type: 'string' }, description: 'Jira webhook events to subscribe to' },
        transitionRules: { type: 'array', items: { type: 'object' }, description: 'Transition rules for issue workflows' },
        defaultAssigneeType: { type: 'string', enum: ['user', 'group', 'auto'], description: 'Default assignee type for new issues' },
      },
      required: ['baseUrl', 'email', 'apiToken', 'projectKey', 'issueType'],
    },
    credentialSource: {
      username: { envVar: 'CTO_JIRA_EMAIL' },
      password: { envVar: 'CTO_JIRA_API_TOKEN' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['create', 'update', 'get', 'query'], description: 'Operation type: create, update, get, or query' },
        projectKey: { type: 'string', description: 'Jira project key' },
        issueType: { type: 'string', description: 'Jira issue type' },
        summary: { type: 'string', description: 'Issue summary/title' },
        description: { type: 'string', description: 'Issue description' },
        issueId: { type: 'string', description: 'Jira issue ID' },
        fields: { type: 'object', description: 'Additional issue fields' },
        endpointUrl: { type: 'string', description: 'Jira API endpoint URL' },
      },
      required: ['operation'],
    },
    outputSchema: CTO_EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 30000,
  }),
  createExternalActionSkill({
    id: 'cto-datadog',
    name: 'Datadog',
    description: 'Query Datadog metrics, monitors, and DORA metrics. Uses configurable Datadog instance with endpoint and auth.',
    system: 'datadog',
    action: 'query_metrics',
    endpoint: {
      method: 'POST',
      envVar: 'CTO_DATADOG_BASE_URL',
    },
    auth: {
      type: 'api_key',
      header: 'DD-API-KEY',
      credentialEnvKeyMap: {
        apiKey: { envVar: 'CTO_DATADOG_API_KEY' },
      },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Datadog base URL' },
        apiKey: { type: 'string', description: 'Datadog API key' },
        applicationKey: { type: 'string', description: 'Datadog application key' },
        site: { type: 'string', enum: ['us1', 'us3', 'us5', 'eu'], description: 'Datadog site' },
        apiKeyPerEnv: { type: 'object', description: 'API keys per environment', properties: { development: { type: 'string' }, staging: { type: 'string' }, production: { type: 'string' } } },
        dashboardIds: { type: 'array', items: { type: 'string' }, description: 'Default dashboard IDs' },
        monitorTags: { type: 'array', items: { type: 'string' }, description: 'Default monitor tags' },
      },
      required: ['baseUrl', 'apiKey', 'applicationKey', 'site'],
    },
    credentialSource: {
      apiKey: { envVar: 'CTO_DATADOG_API_KEY' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['getDoraMetrics', 'getSystemHealth', 'query'], description: 'Operation type: getDoraMetrics, getSystemHealth, or query' },
        service: { type: 'string', description: 'Service name' },
        query: { type: 'string', description: 'Metric query string' },
        timeRange: { type: 'string', description: 'Time range for the query' },
        endpointUrl: { type: 'string', description: 'Datadog API endpoint URL' },
      },
      required: ['operation'],
    },
    outputSchema: CTO_EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 30000,
  }),
  createExternalActionSkill({
    id: 'cto-github',
    name: 'GitHub',
    description: 'Interact with GitHub repositories, issues, PRs, and security alerts. Uses configurable GitHub instance with endpoint and auth.',
    system: 'github',
    action: 'manage_repo',
    endpoint: {
      method: 'POST',
      envVar: 'CTO_GITHUB_BASE_URL',
    },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: {
        token: { envVar: 'CTO_GITHUB_TOKEN' },
      },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'GitHub API base URL' },
        token: { type: 'string', description: 'GitHub access token' },
        apiVersion: { type: 'string', description: 'GitHub API version' },
        defaultOwner: { type: 'string', description: 'Default repository owner or organization' },
        defaultVisibility: { type: 'string', enum: ['public', 'private', 'internal'], description: 'Default repository visibility' },
        repoScopes: { type: 'array', items: { type: 'string' }, description: 'Repository scopes (owner/repo list)' },
        authType: { type: 'string', enum: ['app', 'user'], description: 'GitHub auth type: app or user' },
        webhookSecret: { type: 'string', description: 'Webhook secret for verifying GitHub webhooks' },
      },
      required: ['baseUrl', 'token', 'apiVersion'],
    },
    credentialSource: {
      token: { envVar: 'CTO_GITHUB_TOKEN' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['getSecurityAlerts', 'getRepositoryStats', 'createIssue', 'createPR'], description: 'Operation type: getSecurityAlerts, getRepositoryStats, createIssue, or createPR' },
        repository: { type: 'string', description: 'Repository name (owner/repo)' },
        severity: { type: 'string', enum: ['Critical', 'High', 'Medium', 'Low'], description: 'Vulnerability severity level' },
        branch: { type: 'string', description: 'Git branch name' },
        includeVulnerabilities: { type: 'boolean', description: 'Whether to include vulnerability data' },
        endpointUrl: { type: 'string', description: 'GitHub API endpoint URL' },
      },
      required: ['operation'],
    },
    outputSchema: CTO_EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 30000,
  }),
  createExternalActionSkill({
    id: 'cto-aws',
    name: 'AWS',
    description: 'Query AWS cloud spend, resource status, and configuration. Uses configurable AWS endpoint with token auth.',
    system: 'aws',
    action: 'query_resources',
    endpoint: {
      method: 'POST',
      envVar: 'CTO_AWS_BASE_URL',
    },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: {
        token: { envVar: 'CTO_AWS_API_TOKEN' },
      },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'AWS API base URL' },
        token: { type: 'string', description: 'AWS API token' },
        region: { type: 'string', description: 'Default AWS region' },
        defaultResourceType: { type: 'string', description: 'Default resource type' },
        costPeriod: { type: 'string', enum: ['DAILY', 'MONTHLY', 'QUARTERLY', 'YEARLY'], description: 'Default cost reporting period' },
        roleArn: { type: 'string', description: 'IAM role ARN for cross-account access' },
        profile: { type: 'string', description: 'AWS profile name' },
        retryConfig: { type: 'object', description: 'Retry configuration', properties: { maxRetries: { type: 'number' }, backoffMs: { type: 'number' } } },
      },
      required: ['baseUrl', 'token', 'region'],
    },
    credentialSource: {
      token: { envVar: 'CTO_AWS_API_TOKEN' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['getCloudSpend', 'getResourceStatus', 'listResources'], description: 'Operation type: getCloudSpend, getResourceStatus, or listResources' },
        period: { type: 'string', enum: ['DAILY', 'MONTHLY', 'QUARTERLY', 'YEARLY'], description: 'Reporting period: DAILY, MONTHLY, QUARTERLY, or YEARLY' },
        resourceType: { type: 'string', description: 'AWS resource type' },
        resourceId: { type: 'string', description: 'AWS resource ID' },
        includeTags: { type: 'boolean', description: 'Whether to include resource tags' },
        endpointUrl: { type: 'string', description: 'AWS API endpoint URL' },
      },
      required: ['operation'],
    },
    outputSchema: CTO_EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    id: 'cto-gcp',
    name: 'GCP',
    description: 'Query Google Cloud spend, resource status, and configuration. Uses configurable GCP endpoint with token auth.',
    system: 'gcp',
    action: 'query_resources',
    endpoint: {
      method: 'POST',
      envVar: 'CTO_GCP_BASE_URL',
    },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: {
        token: { envVar: 'CTO_GCP_ACCESS_TOKEN' },
      },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'GCP API base URL' },
        token: { type: 'string', description: 'GCP access token' },
        projectId: { type: 'string', description: 'Default Google Cloud project' },
        region: { type: 'string', description: 'Default Google Cloud region' },
        defaultResourceType: { type: 'string', description: 'Default resource type' },
        credentials: { type: 'object', description: 'Service account credentials JSON', properties: { type: { type: 'string' }, project_id: { type: 'string' }, private_key: { type: 'string' }, client_email: { type: 'string' } } },
      },
      required: ['baseUrl', 'token', 'projectId'],
    },
    credentialSource: {
      token: { envVar: 'CTO_GCP_ACCESS_TOKEN' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['getCloudSpend', 'getResourceStatus', 'listResources'], description: 'Operation type: getCloudSpend, getResourceStatus, or listResources' },
        period: { type: 'string', enum: ['DAILY', 'MONTHLY', 'QUARTERLY', 'YEARLY'], description: 'Reporting period: DAILY, MONTHLY, QUARTERLY, or YEARLY' },
        resourceType: { type: 'string', description: 'GCP resource type' },
        resourceId: { type: 'string', description: 'GCP resource ID' },
        includeLabels: { type: 'boolean', description: 'Whether to include resource labels' },
        endpointUrl: { type: 'string', description: 'GCP API endpoint URL' },
      },
      required: ['operation'],
    },
    outputSchema: CTO_EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    id: 'cto-azure',
    name: 'Azure',
    description: 'Query Azure cloud spend, resource status, and configuration. Uses configurable Azure endpoint with token auth.',
    system: 'azure',
    action: 'query_resources',
    endpoint: {
      method: 'POST',
      envVar: 'CTO_AZURE_BASE_URL',
    },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: {
        token: { envVar: 'CTO_AZURE_ACCESS_TOKEN' },
      },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Azure API base URL' },
        token: { type: 'string', description: 'Azure access token' },
        subscriptionId: { type: 'string', description: 'Default Azure subscription' },
        region: { type: 'string', description: 'Default Azure region' },
        defaultResourceType: { type: 'string', description: 'Default resource type' },
        tenantId: { type: 'string', description: 'Azure tenant ID' },
        clientId: { type: 'string', description: 'Azure client (application) ID' },
        clientSecret: { type: 'string', description: 'Azure client secret', sensitive: true, format: 'password' },
      },
      required: ['baseUrl', 'token', 'subscriptionId'],
    },
    credentialSource: {
      token: { envVar: 'CTO_AZURE_ACCESS_TOKEN' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['getCloudSpend', 'getResourceStatus', 'listResources'], description: 'Operation type: getCloudSpend, getResourceStatus, or listResources' },
        period: { type: 'string', enum: ['DAILY', 'MONTHLY', 'QUARTERLY', 'YEARLY'], description: 'Reporting period: DAILY, MONTHLY, QUARTERLY, or YEARLY' },
        resourceType: { type: 'string', description: 'Azure resource type' },
        resourceId: { type: 'string', description: 'Azure resource ID' },
        includeTags: { type: 'boolean', description: 'Whether to include resource tags' },
        endpointUrl: { type: 'string', description: 'Azure API endpoint URL' },
      },
      required: ['operation'],
    },
    outputSchema: CTO_EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    id: 'cto-pagerduty',
    name: 'PagerDuty',
    description: 'Query PagerDuty incidents, on-call schedules, and escalation policies. Uses configurable PagerDuty endpoint with token auth.',
    system: 'pagerduty',
    action: 'query_incidents',
    endpoint: {
      method: 'POST',
      envVar: 'CTO_PAGERDUTY_BASE_URL',
    },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: {
        token: { envVar: 'CTO_PAGERDUTY_API_TOKEN' },
      },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'PagerDuty API base URL' },
        token: { type: 'string', description: 'PagerDuty API token' },
        defaultTeam: { type: 'string', description: 'Default PagerDuty team' },
        escalationPolicyId: { type: 'string', description: 'Default escalation policy' },
        apiVersion: { type: 'string', description: 'PagerDuty API version' },
        integrationKey: { type: 'string', description: 'Integration key for events API' },
        escalationPolicies: { type: 'array', items: { type: 'object' }, description: 'Escalation policy definitions' },
        defaultService: { type: 'string', description: 'Default PagerDuty service' },
      },
      required: ['baseUrl', 'token', 'defaultTeam'],
    },
    credentialSource: {
      token: { envVar: 'CTO_PAGERDUTY_API_TOKEN' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['getActiveIncidents', 'getOnCallSchedule', 'createIncident'], description: 'Operation type: getActiveIncidents, getOnCallSchedule, or createIncident' },
        team: { type: 'string', description: 'PagerDuty team name' },
        since: { type: 'string', description: 'Start time (ISO string)' },
        until: { type: 'string', description: 'End time (ISO string)' },
        timeZone: { type: 'string', description: 'Timezone for the query' },
        endpointUrl: { type: 'string', description: 'PagerDuty API endpoint URL' },
      },
      required: ['operation'],
    },
    outputSchema: CTO_EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 30000,
  }),
  createExternalActionSkill({
    id: 'cto-kubernetes',
    name: 'Kubernetes',
    description: 'Query Kubernetes cluster health, pod status, and resource utilization. Uses configurable Kubernetes endpoint with token auth.',
    system: 'kubernetes',
    action: 'query_cluster',
    endpoint: {
      method: 'POST',
      envVar: 'CTO_KUBERNETES_BASE_URL',
    },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: {
        token: { envVar: 'CTO_KUBERNETES_API_TOKEN' },
      },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Kubernetes API base URL' },
        token: { type: 'string', description: 'Kubernetes API token' },
        clusterName: { type: 'string', description: 'Default Kubernetes cluster' },
        defaultNamespace: { type: 'string', description: 'Default namespace' },
        context: { type: 'string', description: 'Kubernetes context' },
        kubeconfig: { type: 'string', description: 'Kubeconfig content or path', multiline: true },
      },
      required: ['baseUrl', 'token', 'clusterName'],
    },
    credentialSource: {
      token: { envVar: 'CTO_KUBERNETES_API_TOKEN' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['get_pod_status', 'scan_image_vulnerabilities', 'get_resource_utilization', 'get_cluster_health', 'identify_at_risk_pods', 'get_namespace_summary'], description: 'Operation type: get_pod_status, scan_image_vulnerabilities, get_resource_utilization, get_cluster_health, identify_at_risk_pods, or get_namespace_summary' },
        namespace: { type: 'string', description: 'Kubernetes namespace' },
        pod_name: { type: 'string', description: 'Pod name' },
        image: { type: 'string', description: 'Container image name' },
        severity_threshold: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Vulnerability severity threshold' },
        resource_threshold_percent: { type: 'number', description: 'Resource utilization threshold percentage' },
        payload: { type: 'object', description: 'Additional operation payload' },
        endpointUrl: { type: 'string', description: 'Kubernetes API endpoint URL' },
      },
      required: ['operation'],
    },
    outputSchema: CTO_EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 30000,
  }),
  createExternalActionSkill({
    id: 'cto-cost-optimization',
    name: 'Cost Optimization',
    description: 'Analyze cloud spend, detect anomalies, and recommend cost optimizations. Uses configurable cost optimization endpoint with token auth.',
    system: 'cost_optimization',
    action: 'analyze_costs',
    endpoint: {
      method: 'POST',
      envVar: 'CTO_COST_OPTIMIZATION_BASE_URL',
    },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: {
        token: { envVar: 'CTO_COST_OPTIMIZATION_API_TOKEN' },
      },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Cost optimization API base URL' },
        token: { type: 'string', description: 'Cost optimization API token' },
        cloudProvider: { type: 'string', enum: ['aws', 'gcp', 'azure', 'multi'], description: 'Default cloud provider scope' },
        defaultDays: { type: 'number', description: 'Default analysis window in days' },
        currency: { type: 'string', description: 'Reporting currency' },
        anomalyThreshold: { type: 'number', description: 'Default anomaly threshold percentage' },
        billingExportConfig: { type: 'object', description: 'Billing export configuration', properties: { exportBucket: { type: 'string' }, exportPrefix: { type: 'string' }, frequency: { type: 'string', enum: ['daily', 'hourly'] } } },
        recommendationTypes: { type: 'array', items: { type: 'string' }, description: 'Recommendation types to include' },
      },
      required: ['baseUrl', 'token', 'cloudProvider'],
    },
    credentialSource: {
      token: { envVar: 'CTO_COST_OPTIMIZATION_API_TOKEN' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['analyze_spending', 'detect_anomalies', 'forecast_costs', 'recommend_reserved_instances', 'identify_waste', 'get_cost_by_service', 'get_cost_trends'], description: 'Operation type: analyze_spending, detect_anomalies, forecast_costs, recommend_reserved_instances, identify_waste, get_cost_by_service, or get_cost_trends' },
        days: { type: 'number', description: 'Number of days for analysis' },
        forecast_days: { type: 'number', description: 'Number of days to forecast' },
        cloud_provider: { type: 'string', enum: ['aws', 'gcp', 'azure', 'multi'], description: 'Cloud provider: aws, gcp, azure, or multi' },
        anomaly_threshold: { type: 'number', description: 'Anomaly detection threshold' },
        confidence_level: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Forecast confidence level: low, medium, or high' },
        waste_threshold_percent: { type: 'number', description: 'Waste threshold percentage' },
        payload: { type: 'object', description: 'Additional operation payload' },
        endpointUrl: { type: 'string', description: 'Cost optimization API endpoint URL' },
      },
      required: ['operation'],
    },
    outputSchema: CTO_EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    id: 'cto-team-metrics',
    name: 'Team Metrics',
    description: 'Query engineering team capacity, on-call metrics, and burnout risks. Uses configurable team metrics endpoint with token auth.',
    system: 'team_metrics',
    action: 'query_team_metrics',
    endpoint: {
      method: 'POST',
      envVar: 'CTO_TEAM_METRICS_BASE_URL',
    },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: {
        token: { envVar: 'CTO_TEAM_METRICS_API_TOKEN' },
      },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Team metrics API base URL' },
        token: { type: 'string', description: 'Team metrics API token' },
        defaultTeamId: { type: 'string', description: 'Default engineering team' },
        defaultDays: { type: 'number', description: 'Default analysis window in days' },
        forecastMonths: { type: 'number', description: 'Default capacity forecast horizon' },
        dataSources: { type: 'array', items: { type: 'string' }, description: 'Data sources (github, jira, etc.)' },
        timeWindows: { type: 'object', description: 'Time window configuration', properties: { workHoursStart: { type: 'string' }, workHoursEnd: { type: 'string' }, timezone: { type: 'string' } } },
      },
      required: ['baseUrl', 'token', 'defaultTeamId'],
    },
    credentialSource: {
      token: { envVar: 'CTO_TEAM_METRICS_API_TOKEN' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['get_team_capacity', 'analyze_on_call_metrics', 'identify_burnout_risks', 'forecast_capacity', 'get_mttr_metrics', 'get_team_health', 'get_oncall_coverage'], description: 'Operation type: get_team_capacity, analyze_on_call_metrics, identify_burnout_risks, forecast_capacity, get_mttr_metrics, get_team_health, or get_oncall_coverage' },
        team_id: { type: 'string', description: 'Team identifier' },
        days: { type: 'number', description: 'Number of days for analysis' },
        forecast_months: { type: 'number', description: 'Number of months to forecast' },
        burnout_threshold: { type: 'number', description: 'Burnout risk threshold' },
        include_vacation: { type: 'boolean', description: 'Whether to include vacation time' },
        confidence_level: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Forecast confidence level: low, medium, or high' },
        payload: { type: 'object', description: 'Additional operation payload' },
        endpointUrl: { type: 'string', description: 'Team metrics API endpoint URL' },
      },
      required: ['operation'],
    },
    outputSchema: CTO_EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    id: 'cto-iac-monitoring',
    name: 'IaC Monitoring',
    description: 'Scan infrastructure-as-code drift, compliance status, and state history. Uses configurable IaC monitoring endpoint with API key auth.',
    system: 'iac_monitoring',
    action: 'scan_drift',
    endpoint: {
      method: 'POST',
      envVar: 'CTO_IAC_MONITORING_BASE_URL',
    },
    auth: {
      type: 'api_key',
      header: 'X-IAC-API-Key',
      credentialEnvKeyMap: {
        apiKey: { envVar: 'CTO_IAC_MONITORING_API_KEY' },
      },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'IaC monitoring API base URL' },
        apiKey: { type: 'string', description: 'IaC monitoring API key' },
        tool: { type: 'string', enum: ['terraform', 'cloudformation', 'both'], description: 'Default infrastructure-as-code tool' },
        defaultWorkspace: { type: 'string', description: 'Default Terraform workspace or stack' },
        complianceFramework: { type: 'string', description: 'Default compliance framework' },
        terraformCloudConfig: { type: 'object', description: 'Terraform Cloud configuration', properties: { organization: { type: 'string' }, token: { type: 'string' }, workspace: { type: 'string' } } },
        stateBackendConfig: { type: 'object', description: 'Terraform state backend configuration', properties: { bucket: { type: 'string' }, prefix: { type: 'string' }, region: { type: 'string' } } },
      },
      required: ['baseUrl', 'apiKey', 'tool'],
    },
    credentialSource: {
      apiKey: { envVar: 'CTO_IAC_MONITORING_API_KEY' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['scan_drift', 'get_compliance_status', 'identify_non_compliant_resources', 'get_drift_history'], description: 'Operation type: scan_drift, get_compliance_status, identify_non_compliant_resources, or get_drift_history' },
        payload: { type: 'object', description: 'Operation payload with tool, workspace, severity_threshold, and environment', properties: { tool: { type: 'string', enum: ['terraform', 'cloudformation', 'both'], description: 'IaC tool' }, workspace: { type: 'string', description: 'Workspace name' }, severity_threshold: { type: 'string', enum: ['critical', 'high', 'medium', 'low'], description: 'Severity threshold' }, environment: { type: 'string', description: 'Environment name' } } },
        endpointUrl: { type: 'string', description: 'IaC monitoring API endpoint URL' },
      },
      required: ['operation', 'payload'],
    },
    outputSchema: CTO_EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    id: 'cto-database-operations',
    name: 'Database Operations',
    description: 'Query database instance health, backup status, and replication. Uses configurable database operations endpoint with token auth.',
    system: 'database_operations',
    action: 'query_database',
    endpoint: {
      method: 'POST',
      envVar: 'CTO_DATABASE_OPERATIONS_BASE_URL',
    },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: {
        token: { envVar: 'CTO_DATABASE_OPERATIONS_API_TOKEN' },
      },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Database operations API base URL' },
        token: { type: 'string', description: 'Database operations API token' },
        defaultDatabaseType: { type: 'string', enum: ['postgres', 'mysql', 'mongodb', 'dynamodb', 'all'], description: 'Default database platform' },
        retentionDays: { type: 'number', description: 'Default metric retention window' },
        alertThresholdPercent: { type: 'number', description: 'Default resource alert threshold' },
        connectionPooling: { type: 'object', description: 'Connection pooling configuration', properties: { maxConnections: { type: 'number' }, minConnections: { type: 'number' }, idleTimeoutMs: { type: 'number' } } },
        readReplicas: { type: 'array', items: { type: 'string' }, description: 'Read replica endpoints' },
        pointInTimeRecovery: { type: 'boolean', description: 'Whether point-in-time recovery is enabled' },
      },
      required: ['baseUrl', 'token', 'defaultDatabaseType'],
    },
    credentialSource: {
      token: { envVar: 'CTO_DATABASE_OPERATIONS_API_TOKEN' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['get_instance_health', 'get_backup_status', 'analyze_performance', 'check_scaling_readiness', 'get_replication_status'], description: 'Operation type: get_instance_health, get_backup_status, analyze_performance, check_scaling_readiness, or get_replication_status' },
        payload: { type: 'object', description: 'Operation payload with database_type, instance_name, hours, and environment', properties: { database_type: { type: 'string', enum: ['postgres', 'mysql', 'mongodb', 'dynamodb', 'all'], description: 'Database type' }, instance_name: { type: 'string', description: 'Database instance name' }, hours: { type: 'number', description: 'Number of hours' }, environment: { type: 'string', description: 'Environment name' } } },
        endpointUrl: { type: 'string', description: 'Database operations API endpoint URL' },
      },
      required: ['operation'],
    },
    outputSchema: CTO_EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    id: 'cto-service-mesh',
    name: 'Service Mesh',
    description: 'Query service mesh status, dependencies, and latency. Uses configurable service mesh endpoint with token auth.',
    system: 'service_mesh',
    action: 'query_mesh',
    endpoint: {
      method: 'POST',
      envVar: 'CTO_SERVICE_MESH_BASE_URL',
    },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: {
        token: { envVar: 'CTO_SERVICE_MESH_API_TOKEN' },
      },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Service mesh API base URL' },
        token: { type: 'string', description: 'Service mesh API token' },
        defaultMesh: { type: 'string', enum: ['istio', 'linkerd', 'consul'], description: 'Default service mesh' },
        defaultNamespace: { type: 'string', description: 'Default namespace' },
        latencyThresholdMs: { type: 'number', description: 'Default latency threshold' },
        meshType: { type: 'string', enum: ['istio', 'linkerd', 'consul'], description: 'Service mesh type' },
        mTLSConfig: { type: 'object', description: 'mTLS configuration', properties: { enabled: { type: 'boolean' }, mode: { type: 'string', enum: ['strict', 'permissive', 'disabled'] }, certManager: { type: 'string' } } },
      },
      required: ['baseUrl', 'token', 'defaultMesh'],
    },
    credentialSource: {
      token: { envVar: 'CTO_SERVICE_MESH_API_TOKEN' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['get_mesh_status', 'get_service_dependencies', 'analyze_latency', 'check_traffic_policies', 'identify_bottlenecks'], description: 'Operation type: get_mesh_status, get_service_dependencies, analyze_latency, check_traffic_policies, or identify_bottlenecks' },
        payload: { type: 'object', description: 'Operation payload with mesh_name, namespace, service_name, and latency_threshold_ms', properties: { mesh_name: { type: 'string', enum: ['istio', 'linkerd', 'consul'], description: 'Service mesh name' }, namespace: { type: 'string', description: 'Kubernetes namespace' }, service_name: { type: 'string', description: 'Service name' }, latency_threshold_ms: { type: 'number', description: 'Latency threshold in milliseconds' } } },
        endpointUrl: { type: 'string', description: 'Service mesh API endpoint URL' },
      },
      required: ['operation', 'payload'],
    },
    outputSchema: CTO_EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    id: 'cto-disaster-recovery',
    name: 'Disaster Recovery',
    description: 'Query disaster recovery RPO/RTO status, backup compliance, and failover readiness. Uses configurable disaster recovery endpoint with token auth.',
    system: 'disaster_recovery',
    action: 'query_recovery',
    endpoint: {
      method: 'POST',
      envVar: 'CTO_DISASTER_RECOVERY_BASE_URL',
    },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: {
        token: { envVar: 'CTO_DISASTER_RECOVERY_API_TOKEN' },
      },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Disaster recovery API base URL' },
        token: { type: 'string', description: 'Disaster recovery API token' },
        defaultRecoveryTarget: { type: 'string', enum: ['primary_database', 'backup_location', 'secondary_region'], description: 'Default recovery target' },
        backupRetentionDays: { type: 'number', description: 'Required backup retention window' },
        complianceFramework: { type: 'string', description: 'Recovery compliance framework' },
        rpoTarget: { type: 'number', description: 'Recovery point objective target in minutes' },
        rtoTarget: { type: 'number', description: 'Recovery time objective target in minutes' },
        failoverRegions: { type: 'array', items: { type: 'string' }, description: 'Failover regions' },
        testSchedule: { type: 'string', description: 'DR test schedule (cron)' },
      },
      required: ['baseUrl', 'token', 'defaultRecoveryTarget'],
    },
    credentialSource: {
      token: { envVar: 'CTO_DISASTER_RECOVERY_API_TOKEN' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['get_rpo_status', 'get_rto_status', 'check_backup_compliance', 'verify_failover_readiness', 'get_recovery_metrics'], description: 'Operation type: get_rpo_status, get_rto_status, check_backup_compliance, verify_failover_readiness, or get_recovery_metrics' },
        payload: { type: 'object', description: 'Operation payload with recovery_target, backup_type, test_failover, environment, and time_range', properties: { recovery_target: { type: 'string', enum: ['primary_database', 'backup_location', 'secondary_region'], description: 'Recovery target' }, backup_type: { type: 'string', enum: ['full', 'incremental', 'differential', 'continuous'], description: 'Backup type' }, test_failover: { type: 'boolean', description: 'Whether to test failover' }, environment: { type: 'string', description: 'Environment name' }, time_range: { type: 'string', description: 'Time range' } } },
        endpointUrl: { type: 'string', description: 'Disaster recovery API endpoint URL' },
      },
      required: ['operation'],
    },
    outputSchema: CTO_EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 60000,
  }),
];

export const ctoSkills: Tool[] = [...CTO_TOOLS, ...CTO_EXTERNAL_SKILLS];
