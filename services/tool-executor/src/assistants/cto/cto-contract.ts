export const INFRA_PROVIDERS = [
  'datadog',
  'aws',
  'gcp',
  'azure',
  'kubernetes',
  'service-mesh',
  'cost-optimization',
  'iac-monitoring',
  'database-operations',
  'team-metrics',
  'github-read',
];

export const ENG_PROVIDERS = ['jira', 'pagerduty', 'github-write'];

export const DISASTER_PROVIDERS = ['disaster-recovery'];

export function engActionsSource(): string {
  return `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
    const ENG_PROVIDERS = ['jira','pagerduty','github-write'];
    const provider = input.provider;
    const action = input.action;
    const params = input.params || {};
    const dryRun = input.dryRun !== false;

    if (!provider || !ENG_PROVIDERS.includes(provider)) {
      const result = { success: false, provider, action, params, dryRun, error: 'Invalid or missing provider. Must be one of: ' + ENG_PROVIDERS.join(', ') };
      console.log(JSON.stringify({ ...result, present: [{ id: 'error', title: 'Engineering Actions Error', kind: 'text', body: result.error }] }));
      return result;
    }

    if (!action) {
      const result = { success: false, provider, action, params, dryRun, error: 'Missing required action parameter' };
      console.log(JSON.stringify({ ...result, present: [{ id: 'error', title: 'Engineering Actions Error', kind: 'text', body: result.error }] }));
      return result;
    }

    const result = { success: false, provider, action, params, dryRun, error: 'Not connected: external system unavailable for ' + provider };
    const body = 'Provider: ' + provider + '\\nAction: ' + action + '\\nParams: ' + JSON.stringify(params) + '\\nDry Run: ' + dryRun + '\\n\\nNot connected: external system unavailable for ' + provider;
    console.log(JSON.stringify({ ...result, present: [{ id: 'result', title: 'Engineering Action', kind: 'text', body: body }] }));
    return result;
  })();`;
}

// These three evaluators take the thing they analyse as an input (scored systems,
// billing rows, incident signals) and return "Not connected: no <X> supplied"
// when it is absent. Nothing but a person can supply that, so their honest
// trigger is User -- a Schedule or Event trigger left them permanently
// unreachable as bound.
export const ARCH_DEBT_TRIGGERS = [
  { kind: 'user' as const, phrase_examples: ['Evaluate tech debt across our services', 'Rank these systems for modernization', 'Produce a modernization roadmap'] },
];

export const CLOUD_SPEND_TRIGGERS = [
  { kind: 'user' as const, phrase_examples: ['Review our cloud spend', 'Where can we save on infrastructure', 'Recommend rightsizing for these services'] },
];

export const INCIDENT_WAR_ROOM_TRIGGERS = [
  { kind: 'user' as const, phrase_examples: ['Correlate these incident signals', 'Build a root cause hypothesis', 'Draft the war room update'] },
];

export const IAC_REMEDIATION_TRIGGERS = [
  { kind: 'event' as const, on: 'Detected infrastructure drift fired' },
];
