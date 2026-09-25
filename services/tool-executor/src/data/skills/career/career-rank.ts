import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const CAREER_BASE_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

// career-rank: scores and ranks job listings against the user profile.
// Returns { success, data: { ranked, totalScored, totalAfterFilter, rankPath, weights } }
const CAREER_RANK_SOURCE = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
const fs = require('fs');
const path = require('path');
const baseDir = process.env.CAREER_HOME || '/tmp/career';
const items = Array.isArray(input.items) ? input.items : (input.items && input.items.listings ? input.items.listings : []);
const profilePath = path.join(baseDir, 'profiles', (input.profileId || 'default') + '.json');
const profile = fs.existsSync(profilePath) ? JSON.parse(fs.readFileSync(profilePath, 'utf8')) : {};
const prefs = profile.preferences || {};
const targetRoles = (prefs.targetRoles || []).map((r) => r.toLowerCase());
const targetCompanies = (prefs.targetCompanies || []).map((c) => c.toLowerCase());
const keywords = (prefs.keywords || []).map((k) => k.toLowerCase());
const minSalary = prefs.minSalary || 0;
const maxSalary = prefs.maxSalary || Infinity;
const excludeCompanies = (prefs.excludeCompanies || []).map((c) => c.toLowerCase());
const weights = input.weights || { role: 0.35, company: 0.15, salary: 0.2, location: 0.15, keywords: 0.15 };

function scoreJob(job) {
  let score = 0;
  const rationale = [];
  const title = (job.title || '').toLowerCase();
  const roleScore = targetRoles.length ? targetRoles.some((r) => title.includes(r) || title.startsWith(r)) ? 1 : 0 : 0.5;
  score += roleScore * weights.role;
  if (roleScore > 0) rationale.push('Title matches target role');
  const company = (job.company || '').toLowerCase();
  const excluded = excludeCompanies.some((c) => company.includes(c));
  const companyScore = excluded ? 0 : (targetCompanies.length ? (targetCompanies.some((c) => company.includes(c)) ? 1 : 0.3) : 0.5);
  score += companyScore * weights.company;
  if (excluded) rationale.push('Company is excluded');
  else if (companyScore > 0.5) rationale.push('Target company match');
  const sal = job.salary || {};
  let salaryScore = 0.5;
  if (sal.min && sal.max) {
    const overlap = Math.max(0, Math.min(sal.max, maxSalary) - Math.max(sal.min, minSalary));
    const range = Math.max(1, (maxSalary || sal.max) - (minSalary || sal.min));
    salaryScore = Math.min(1, overlap / range);
  }
  score += salaryScore * weights.salary;
  if (salaryScore > 0.7) rationale.push('Salary fits target range');
  const remote = !!job.remote;
  const workArrangement = prefs.workArrangement || ['onsite', 'hybrid', 'remote'];
  const locationScore = remote || workArrangement.includes('remote') ? 1 : 0.5;
  score += locationScore * weights.location;
  if (remote) rationale.push('Remote friendly');
  const desc = (job.description || '').toLowerCase();
  const kwScore = keywords.length ? keywords.filter((k) => desc.includes(k)).length / keywords.length : 0.5;
  score += kwScore * weights.keywords;
  if (kwScore > 0.5) rationale.push('Strong keyword overlap');
  return {
    jobId: job.id,
    title: job.title,
    company: job.company,
    score: Math.round(score * 100) / 100,
    weightedBreakdown: {
      role: Math.round(roleScore * weights.role * 100) / 100,
      company: Math.round(companyScore * weights.company * 100) / 100,
      salary: Math.round(salaryScore * weights.salary * 100) / 100,
      location: Math.round(locationScore * weights.location * 100) / 100,
      keywords: Math.round(kwScore * weights.keywords * 100) / 100,
    },
    rationale,
    excluded,
  };
}

const ranked = items.map(scoreJob).filter((r) => !r.excluded).sort((a, b) => b.score - a.score);
const rankPath = path.join(baseDir, 'applications', 'rankings.json');
fs.mkdirSync(path.dirname(rankPath), { recursive: true });
fs.writeFileSync(rankPath, JSON.stringify({ ranked, generatedAt: new Date().toISOString(), weights }, null, 2));
console.log(JSON.stringify({ success: true, data: { ranked, totalScored: items.length, totalAfterFilter: ranked.length, rankPath, weights, generatedAt: new Date().toISOString() } }));
})();`;

const CAREER_RANK_INPUT = {
  type: 'object',
  properties: {
    items: { type: 'array', description: 'Job listings to rank' },
    profileId: { type: 'string', default: 'default' },
    weights: { type: 'object', description: 'Custom weight overrides' },
  },
};

const CAREER_RANK_OUTPUT = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        ranked: { type: 'array' },
        totalScored: { type: 'number' },
        totalAfterFilter: { type: 'number' },
        rankPath: { type: 'string' },
        weights: { type: 'object' },
        generatedAt: { type: 'string', format: 'date-time' },
      },
    },
  },
  required: ['success', 'data'],
};

const CAREER_RANK = createCodeSkill({
  id: 'career-rank',
  name: 'Rank Opportunities',
  description: 'Scores and ranks job listings against the user profile using weighted criteria: role match, company preference, salary fit, location/remote, and keyword overlap.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: CAREER_RANK_SOURCE,
    configSchema: CAREER_BASE_CONFIG_SCHEMA,
    actionLabel: 'Rank jobs',
  },
  inputSchema: CAREER_RANK_INPUT,
  outputSchema: CAREER_RANK_OUTPUT,
  triggers: [
    { kind: 'user', phrase_examples: ['Rank these jobs', 'Score my opportunities', 'Sort by fit'] },
  ],
});
CAREER_RANK.configSchema = CAREER_RANK.manifest.configSchema as SchemaRecord;

export { CAREER_RANK };
