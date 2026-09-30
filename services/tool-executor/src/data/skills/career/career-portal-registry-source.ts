// Portal registry and targeting.
//
// Two jobs:
//
//   1. Configuration. Sources are declared in a JSON file under CAREER_HOME
//      rather than compiled in, so an operator can add or disable a board
//      without editing the skill. The file is optional: a stock install works
//      with no configuration at all.
//
//   2. Targeting. When the caller supplies no queries and no companies, the
//      skill derives its search terms from the stored candidate profile —
//      including the resume text. That is what makes "find me roles that fit
//      my resume" work without the user restating their own job title.
//
// Shape mirrors career-ops's portals.yml, expressed as JSON since the runtime
// here is Node without a YAML parser dependency:
//
//   {
//     "tracked_companies": [ { "name": "Acme", "token": "acme",
//                               "provider": "greenhouse", "enabled": true } ],
//     "job_boards":        [ { "id": "remoteok", "enabled": true } ]
//   }
//
// Both lists share one entry contract. A single-company ATS adapter belongs in
// tracked_companies; an aggregator/feed belongs in job_boards.

export const CAREER_PORTAL_REGISTRY_SOURCE = String.raw`
// ---------------------------------------------------------------- registry

function portalsConfigPath() {
  return path.join(baseDir, 'portals.json');
}

// Returns { tracked_companies, job_boards, source }. Never throws: a missing
// file is the normal case, and a malformed one is reported as a note so the
// run still proceeds on the built-in defaults rather than failing outright.
function loadPortalConfig() {
  const p = portalsConfigPath();
  if (!fs.existsSync(p)) {
    return { tracked_companies: [], job_boards: [], source: 'built-in defaults (no portals.json)', warning: null };
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return {
      tracked_companies: [],
      job_boards: [],
      source: p,
      warning: 'portals.json is not valid JSON (' + (e && e.message ? e.message : String(e)) + '); falling back to built-in defaults',
    };
  }
  if (!isPlainObject(parsed)) {
    return { tracked_companies: [], job_boards: [], source: p, warning: 'portals.json is not an object; falling back to built-in defaults' };
  }
  return {
    tracked_companies: Array.isArray(parsed.tracked_companies) ? parsed.tracked_companies : [],
    job_boards: Array.isArray(parsed.job_boards) ? parsed.job_boards : [],
    source: p,
    warning: null,
  };
}

// Normalizes one tracked_companies entry into { name, company, token, provider,
// careersUrl }. An entry may pin a provider explicitly, or leave it to
// detection: the first provider whose listUrl accepts the entry claims it.
function normalizeCompanyEntry(raw) {
  if (!isPlainObject(raw)) return null;
  const name = String(raw.name || raw.company || '').trim();
  if (!name) return null;
  if (raw.enabled === false) return null;
  return {
    name: name,
    company: String(raw.company || name),
    token: raw.token ? String(raw.token) : slug(raw.token || name),
    provider: raw.provider ? String(raw.provider) : null,
    careers_url: raw.careers_url ? String(raw.careers_url) : null,
    api: raw.api ? String(raw.api) : null,
    site: raw.site ? String(raw.site) : null,
    max_pages: numOr(raw.max_pages, null),
  };
}

function normalizeBoardEntry(raw) {
  if (isPlainObject(raw)) {
    if (raw.enabled === false) return null;
    const id = String(raw.id || raw.provider || '').trim();
    if (!id) return null;
    return { id: id };
  }
  const id = String(raw || '').trim();
  if (!id) return null;
  return { id: id };
}

// Picks the provider for an entry: an explicit \`provider:\` field wins, then the
// first provider whose listUrl accepts the entry and yields a URL. Returns null
// when nothing claims it, which is reported as an uncovered entry rather than
// silently skipped.
function resolveProviderFor(entry) {
  if (entry.provider) {
    const p = ATS_PROVIDERS[entry.provider];
    if (!p) return { provider: null, reason: 'provider "' + entry.provider + '" is not one this build knows' };
    return { provider: p, url: p.listUrl(entry) };
  }
  for (const id of ATS_PROVIDER_IDS) {
    const p = ATS_PROVIDERS[id];
    // Auto-detection must not hand a Workday entry to Greenhouse just because
    // the company name also happens to be a Greenhouse board slug.
    if (!providerMayClaim(p, entry)) continue;
    let url = null;
    try {
      url = p.listUrl(entry);
    } catch (e) {
      url = null;
    }
    if (url) return { provider: p, url: url };
  }
  return { provider: null, reason: 'no provider claimed this entry' };
}

// ---------------------------------------------------------------- targeting

// Reads the stored profile so a run with no explicit criteria can still search.
// Returns { profile, targetRoles, targetCompanies, keywords, resumeText }.
function loadCandidateProfile() {
  const profileId = input.profileId || 'default';
  const p = path.join(baseDir, 'profiles', profileId + '.json');
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return null;
  }
}

function collectResumeText(profile) {
  if (!isPlainObject(profile)) return '';
  const parts = [];
  const r = profile.resume;
  if (isPlainObject(r)) {
    if (typeof r.parsedText === 'string') parts.push(r.parsedText);
    if (typeof r.rawText === 'string' && r.rawText !== r.parsedText) parts.push(r.rawText);
  }
  if (typeof profile.resumeText === 'string') parts.push(profile.resumeText);
  if (typeof profile.summary === 'string') parts.push(profile.summary);
  return parts.filter(Boolean).join('\n').trim();
}

// Stems a role phrase to its distinctive head noun so "Chief Product Officer"
// and "Senior Product Manager" share the searchable token "product".
function roleTokens(role) {
  const stop = new Set(['a', 'an', 'the', 'of', 'and', 'or', 'to', 'for', 'in', 'at', 'senior', 'sr', 'junior', 'jr', 'staff', 'principal', 'lead', 'head', 'chief', 'vp', 'vice', 'president', 'director', 'manager', 'associate', 'specialist', 'general']);
  const words = String(role || '').toLowerCase().split(/[^a-z0-9+#.]+/).filter(Boolean);
  return words.filter(function (w) { return w.length > 2 && !stop.has(w); });
}

// Derives search queries from the profile when the caller gave none.
//
// Order of preference:
//   1. preferences.targetRoles, which the user has already curated
//   2. title-ish lines from the resume, which is the "determine it from my
//      resume" path
//
// The resume path deliberately looks for a self-declared title near the top of
// the document rather than trying to infer one from the whole body: a resume
// contains every job the candidate has ever had, so scanning all of it yields
// whatever is most frequent rather than what they want next.
function deriveQueriesFromProfile(profile) {
  const prefs = isPlainObject(profile) && isPlainObject(profile.preferences) ? profile.preferences : {};
  const explicit = asList(prefs.targetRoles);
  if (explicit.length) return { queries: explicit, from: 'profile preferences.targetRoles' };

  const resume = collectResumeText(profile);
  if (!resume) return { queries: [], from: null };

  const lines = resume.split(/[\r\n]+/).map(function (l) { return l.trim(); }).filter(Boolean);
  const found = [];
  for (const line of lines.slice(0, 25)) {
    const t = stripHtml(line);
    // A headline line: short, no sentence punctuation, and contains a role word.
    if (t.length > 60 || t.length < 3) continue;
    if (/[.!?;]/.test(t)) continue;
    if (/\b(experience|education|skills|summary|contact|email|phone|linkedin|github|http)/i.test(t)) continue;
    const tokens = roleTokens(t);
    if (!tokens.length) continue;
    if (!/(officer|manager|director|engineer|developer|designer|analyst|scientist|architect|consultant|lead|head|vp|president|specialist|strategist|marketer|recruiter|researcher|writer|accountant|attorney|advisor|scientist|technician|nurse|teacher|professor|sales)/i.test(t)) continue;
    found.push(t);
    if (found.length >= 3) break;
  }
  return { queries: found, from: 'resume headline' };
}

// Derives target companies from the profile, used to seed the ATS tier when the
// caller named no companies.
function deriveCompaniesFromProfile(profile) {
  const prefs = isPlainObject(profile) && isPlainObject(profile.preferences) ? profile.preferences : {};
  const explicit = asList(prefs.targetCompanies);
  if (explicit.length) return explicit;
  const fromResume = [];
  const resume = collectResumeText(profile);
  const expRe = /\b(?:at|@)\s+([A-Z][A-Za-z0-9&.\- ]{1,40})/g;
  let m;
  while ((m = expRe.exec(resume)) && fromResume.length < 15) {
    const name = m[1].trim().replace(/[.,]$/, '');
    if (name.length > 1 && !fromResume.includes(name)) fromResume.push(name);
  }
  return fromResume;
}

// Keyword filter terms derived from the profile, used to keep the query
// substring test from admitting every listing that shares one common word.
function deriveKeywordsFromProfile(profile) {
  const prefs = isPlainObject(profile) && isPlainObject(profile.preferences) ? profile.preferences : {};
  return asList(prefs.keywords).map(function (k) { return String(k).toLowerCase(); }).filter(Boolean);
}
`;

// Exported so the caller can tell the user what configuration is supported.
export const PORTAL_CONFIG_DOC = {
  path: '$CAREER_HOME/portals.json',
  tracked_companies: [
    { name: 'Acme', token: 'acme', provider: 'greenhouse' },
    { name: 'Globex', careers_url: 'https://globex.wd5.myworkdayjobs.com/careers', site: 'careers' },
  ],
  job_boards: [{ id: 'remoteok' }, { id: 'remotive' }, { id: 'arbeitnow' }],
};
