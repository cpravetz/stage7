// @ts-nocheck
import { Tool, SchemaRecord } from '../../../types';
import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';

const CAREER_BASE_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

// career-rank: scores and ranks job listings against the user profile.
// Returns { success, data: { ranked, totalScored, totalAfterFilter, droppedOffTarget,
// droppedOffTargetCount, roleQueries, rankPath, weights } }
//
// Role is the axis a job search is actually about, so it carries the heaviest weight
// and it is scored against the terms of THIS run. An earlier version scored role
// against the saved profile only and gave every axis a flat 0.5 whenever the profile
// had nothing to say, which made the weighted total a constant (0.57) for every
// listing no matter how far it was from the search. A search for "Engineering
// Manager" therefore returned a customer service rep with the same rating as the
// engineering role. Three things are fixed here:
//   1. the search terms typed into the run are scored, not just the profile;
//   2. role is weighted heaviest and is graded, so a real title match outranks a
//      near miss and a listing with no title overlap scores zero on the axis;
//   3. the location axis no longer reads its own default preference list as a
//      match, and an unconfigured salary range is unknown rather than zero.

const CAREER_RANK_INPUT = {
  type: 'object',
  properties: {
    items: { type: 'array', description: 'Job listings to rank' },
    jobTitles: { type: 'array', items: { type: 'string' }, description: 'The role terms this run searched for. Scored as the role axis alongside the saved profile titles.' },
    minRoleScore: { type: 'number', description: 'Drop listings whose role match scores below this. 0 (the default) keeps every listing; 0.01 keeps only listings whose title matched at least one searched role.' },
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
        ranked: { type: 'array', description: 'Scored listings, best fit first. Each row carries roleScore, roleMatch and relevance alongside the weighted score.' },
        totalScored: { type: 'number' },
        totalAfterFilter: { type: 'number' },
        droppedOffTarget: { type: 'array', description: 'Listings held back because their title matched none of the searched roles. Not lost: still listed here with the role match that excluded them.' },
        droppedOffTargetCount: { type: 'number' },
        roleQueries: { type: 'array', description: 'The role terms the role axis was scored against' },
        rankPath: { type: 'string' },
        weights: { type: 'object' },
        generatedAt: { type: 'string', format: 'date-time' },
      },
    },
  },
  required: ['success', 'data'],
};

// Role heaviest by a wide margin. The remaining axes are context the candidate cares
// about but that cannot on its own make a wrong job the right job. Declared inside the
// handler because the handler is stringified into the skill sandbox, where nothing
// from this module's scope exists.

const CAREER_RANK = createDeclarativeCodeSkill({
  id: 'career-rank',
  isSkill: false,
  name: 'Rank Opportunities',
  description: 'Scores and ranks job listings against the search terms and the user profile, weighting role match most heavily, then description keywords, salary fit, location/remote and company preference. Returns each listing with the role match that produced its score.',
  persistenceEnvVar: 'CAREER_HOME',
  inputSchema: CAREER_RANK_INPUT,
  outputSchema: CAREER_RANK_OUTPUT,
  triggers: [
    { kind: 'user', phrase_examples: ['Rank these jobs', 'Score my opportunities', 'Sort by fit'] },
  ],
  manifest: {
    configSchema: CAREER_BASE_CONFIG_SCHEMA,
    actionLabel: 'Rank jobs'
  },
  handler: async function handler(input, ctx) {
      const items = Array.isArray(input.items) ? input.items : (input.items && input.items.listings ? input.items.listings : []);
      const profile = ctx.store.load('profilePath', {});
      const prefs = profile.preferences || {};

      // Role heaviest by a wide margin. The remaining axes are context the candidate
      // cares about but that cannot on its own make a wrong job the right job.
      const CAREER_RANK_WEIGHTS = { role: 0.45, keywords: 0.2, salary: 0.15, location: 0.1, company: 0.1 };

      function asList(value) {
        if (!Array.isArray(value)) return [];
        return value.map(function (v) { return String(v == null ? '' : v).trim(); }).filter(Boolean);
      }

      function numOrZero(value) {
        const parsed = Number(value);
        return isFinite(parsed) ? parsed : 0;
      }

      // ------------------------------------------------------------------ role axis
      //
      // The terms the role axis is scored against: what this run searched for first,
      // then the titles already saved on the profile. Without this the axis only ever
      // saw prefs.targetRoles, so a search typed into the Job Search box could not
      // influence a single score it produced.
      const roleQueries = [];
      function pushRoles(values) {
        for (const value of values) {
          const term = String(value).toLowerCase().trim();
          if (term && roleQueries.indexOf(term) < 0) roleQueries.push(term);
        }
      }
      pushRoles(asList(input.jobTitles));
      pushRoles(asList(input.roles));
      pushRoles(asList(input.queries));
      pushRoles(asList(profile.targetTitles));
      pushRoles(asList(prefs.targetRoles));
      const hasRoleTargets = roleQueries.length > 0;

      // Seniority and employment noise is stripped from both sides so "Sr. Software
      // Engineer" and "Engineering Manager" are compared on what they are rather than
      // on the years it took to get there. Level words (manager, director, lead) are
      // deliberately NOT stripped: they are the role.
      const SENIORITY = ['senior', 'sr', 'junior', 'jr', 'entry', 'entrylevel', 'graduate', 'intern', 'internship', 'apprentice', 'contract', 'permanent', 'fulltime', 'parttime', 'freelance'];

      function normTokens(value) {
        const raw = String(value == null ? '' : value).toLowerCase().split(/[^a-z0-9+#.]+/);
        const out = [];
        for (const token of raw) {
          // Trim the punctuation the split keeps, so ".net" compares as "net".
          const clean = token.replace(/^[.]+|[.]+$/g, '');
          if (!clean || clean.length < 2) continue;
          if (SENIORITY.indexOf(clean) >= 0) continue;
          out.push(clean);
        }
        return out;
      }

      function stem(token) {
        return token.length > 3 && /s$/.test(token) ? token.slice(0, -1) : token;
      }

      // Derived forms of the same word have to match: "engineering"/"engineer",
      // "managers"/"manager". Equality alone dropped every derived title; a plain
      // substring test was avoided because "ai" would otherwise match "maintain".
      function tokenMatches(a, b) {
        if (a === b) return true;
        const sa = stem(a);
        const sb = stem(b);
        if (sa === sb) return true;
        return sa.length >= 3 && sb.length >= 3 && (sa.startsWith(sb) || sb.startsWith(sa));
      }

      // Graded rather than binary. The old check was `title.includes(role)`, so a role
      // got full credit for sharing a single word with the target and everything else
      // got nothing, which is why the axis could not separate a good match from a bad
      // one even when the profile was filled in.
      function roleScoreFor(title) {
        const titleTokens = normTokens(title);
        if (!titleTokens.length) return { score: 0, match: null, hitTerms: [] };
        const titleNorm = titleTokens.join(' ');
        let best = { score: 0, match: null, hitTerms: [] };
        for (const query of roleQueries) {
          const queryTokens = normTokens(query);
          if (!queryTokens.length) continue;
          const phrase = queryTokens.join(' ');
          const hitTerms = queryTokens.filter(function (t) {
            return titleTokens.some(function (tt) { return tokenMatches(tt, t); });
          });
          let score = 0;
          if (titleNorm === phrase) score = 1;
          else if (titleNorm.indexOf(phrase) >= 0) score = 0.95;
          else if (hitTerms.length === queryTokens.length) score = 0.8;
          else if (hitTerms.length / queryTokens.length >= 0.5) score = 0.4 * (hitTerms.length / queryTokens.length);
          if (score > best.score) best = { score: score, match: query, hitTerms: hitTerms };
        }
        return best;
      }

      // ---------------------------------------------------------------- other axes
      const targetCompanies = asList(prefs.targetCompanies).map(function (c) { return c.toLowerCase(); });
      const profileKeywords = asList(prefs.keywords).map(function (k) { return k.toLowerCase(); });
      // The searched role is also the best description keyword available: a listing
      // whose description really is about engineering is worth more than one that
      // merely says so once in a boilerplate line.
      const keywordTerms = [];
      for (const value of profileKeywords.concat(hasRoleTargets ? roleQueries : [])) {
        for (const token of normTokens(value)) {
          if (keywordTerms.indexOf(token) < 0) keywordTerms.push(token);
        }
      }
      const minSalary = numOrZero(prefs.minSalary);
      const maxSalary = numOrZero(prefs.maxSalary) > 0 ? numOrZero(prefs.maxSalary) : Infinity;
      // With no target range set, salary cannot be assessed either way. That is
      // unknown, not a failure to match, so it scores neutral instead of zero.
      const salaryConfigured = minSalary > 0 || isFinite(maxSalary);
      const excludeCompanies = asList(prefs.excludeCompanies).map(function (c) { return c.toLowerCase(); });
      const arrangements = asList(prefs.workArrangement).map(function (a) { return a.toLowerCase(); });
      const wantsRemote = arrangements.indexOf('remote') >= 0;
      const wantsOnsite = arrangements.indexOf('onsite') >= 0 || arrangements.indexOf('hybrid') >= 0;
      const weights = Object.assign({}, CAREER_RANK_WEIGHTS, input.weights || {});
      // Any override is rebalanced against the rest so the weights always sum to 1.
      const weightSum = Object.keys(weights).reduce(function (sum, key) { return sum + (Number(weights[key]) || 0); }, 0) || 1;
      for (const key of Object.keys(weights)) weights[key] = (Number(weights[key]) || 0) / weightSum;

      function scoreJob(job) {
        const rationale = [];

        // Role: the heaviest weight, and the only axis that can separate one listing
        // from another when the profile is empty.
        const role = roleScoreFor(job.title);
        rationale.push(role.score >= 0.95
          ? 'Title matches "' + role.match + '"'
          : role.score > 0
            ? 'Title partly matches "' + role.match + '" (' + role.hitTerms.join(', ') + ')'
            : hasRoleTargets
              ? 'Title does not match the searched role'
              : 'No target role saved, so role could not be scored');

        const company = String(job.company || '').toLowerCase();
        const excluded = excludeCompanies.some(function (c) { return company.indexOf(c) >= 0; });
        const companyScore = excluded ? 0 : (targetCompanies.length ? (targetCompanies.some(function (c) { return company.indexOf(c) >= 0; }) ? 1 : 0.3) : 0.5);

        const sal = job.salary || {};
        let salaryScore = 0.5;
        if (salaryConfigured && sal.min != null && sal.max != null) {
          const overlap = Math.max(0, Math.min(sal.max, maxSalary) - Math.max(sal.min, minSalary));
          const range = Math.max(1, maxSalary - minSalary);
          salaryScore = overlap > 0 ? Math.min(1, overlap / range) : 0;
        }

        // Location reads the candidate's stated arrangements, not the default list.
        // `workArrangement.includes('remote')` was always true against the shipped
        // default ['onsite','hybrid','remote'], so every listing got full marks here
        // whatever its location.
        const remote = !!job.remote;
        const locationScore = remote
          ? (wantsRemote ? 1 : 0.4)
          : (wantsOnsite ? 0.8 : 0.3);

        const descTokens = normTokens(job.description);
        let kwHit = 0;
        const kwMatched = [];
        for (const term of keywordTerms) {
          if (descTokens.some(function (dt) { return tokenMatches(dt, term); })) { kwHit++; kwMatched.push(term); }
        }
        const kwScore = keywordTerms.length ? Math.min(1, kwHit / keywordTerms.length) : 0.5;

        const total =
          role.score * weights.role +
          companyScore * weights.company +
          salaryScore * weights.salary +
          locationScore * weights.location +
          kwScore * weights.keywords;

        if (excluded) rationale.push('Company is excluded');
        else if (companyScore > 0.5) rationale.push('Target company match');
        if (salaryScore > 0.7) rationale.push('Salary fits target range');
        else if (salaryScore === 0) rationale.push('Salary outside target range');
        rationale.push(remote ? 'Remote friendly' : 'On-site or hybrid role');
        if (kwMatched.length) rationale.push('Description covers: ' + kwMatched.slice(0, 6).join(', '));

        const relevance = role.score >= 0.7 ? 'on-target' : (role.score > 0 ? 'adjacent' : (hasRoleTargets ? 'off-target' : 'unscored'));

        return {
          // Preserve every field from the incoming listing. Downstream skills store these
          // ranked rows as the workspace listings and need applyUrl, location, salary and
          // description; a lean row here would strip them.
          ...job,
          id: job.id,
          jobId: job.id,
          title: job.title,
          company: job.company,
          score: Math.round(total * 100) / 100,
          // The role match is surfaced, not folded silently into the total, so a score
          // can be read as "why is this here" rather than as an unexplained number.
          roleScore: Math.round(role.score * 100) / 100,
          roleMatch: role.match,
          relevance: relevance,
          weightedBreakdown: {
            role: Math.round(role.score * weights.role * 100) / 100,
            company: Math.round(companyScore * weights.company * 100) / 100,
            salary: Math.round(salaryScore * weights.salary * 100) / 100,
            location: Math.round(locationScore * weights.location * 100) / 100,
            keywords: Math.round(kwScore * weights.keywords * 100) / 100,
          },
          rationale: rationale,
          excluded: excluded,
        };
      }

      const scored = items.map(scoreJob);

      // The relevance floor, applied only when there are role terms to be judged
      // against: with nothing searched for there is no such thing as an off-target
      // listing, so a profile-only run still returns everything it was given. The
      // default sits just above zero, so what it removes is exactly the listings whose
      // title matched none of the searched roles. Pass minRoleScore: 0 to keep them.
      const floor = hasRoleTargets
        ? (typeof input.minRoleScore === 'number' ? input.minRoleScore : 0.01)
        : 0;
      const kept = scored.filter(function (row) {
        return !row.excluded && (floor <= 0 || row.roleScore >= floor);
      });
      const droppedOffTarget = scored.filter(function (row) {
        return !row.excluded && (floor > 0 && row.roleScore < floor);
      }).sort(function (a, b) { return b.score - a.score; });

      const ranked = kept.sort(function (a, b) { return b.score - a.score; });
      ctx.store.save('rankPath', { ranked: ranked, droppedOffTarget: droppedOffTarget, generatedAt: new Date().toISOString(), weights: weights, roleQueries: roleQueries });
      return {
        success: true,
        data: {
          ranked: ranked,
          totalScored: items.length,
          totalAfterFilter: ranked.length,
          // Dropped rows are reported, not discarded: a run that hides 40 listings
          // has to be able to say which ones and why.
          droppedOffTarget: droppedOffTarget,
          droppedOffTargetCount: droppedOffTarget.length,
          roleQueries: roleQueries,
          roleFloor: floor,
          rankPath: 'rankPath',
          weights: weights,
          generatedAt: new Date().toISOString(),
        },
      };
    }
  });
CAREER_RANK.configSchema = CAREER_BASE_CONFIG_SCHEMA;
CAREER_RANK.configSchema = CAREER_RANK.manifest.configSchema as SchemaRecord;

export { CAREER_RANK };
