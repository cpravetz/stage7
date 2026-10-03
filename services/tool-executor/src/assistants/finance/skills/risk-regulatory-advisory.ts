// @ts-nocheck
import { createDeclarativeCodeSkill, createSchemaRecord, SchemaProps } from '../../../adk/code-skill-factory';
import { financeResultSchema } from '../finance-contract';

const riskRegulatoryAdvisoryInputSchema = createSchemaRecord({
  entityId: SchemaProps.text({ description: 'Entity or organization identifier' }),
  portfolio: SchemaProps.objectArray(SchemaProps.object({
    asset: SchemaProps.text({ description: 'Asset identifier' }),
    value: SchemaProps.number({ description: 'Position value', minimum: 0 }),
    weight: SchemaProps.number({ description: 'Portfolio weight (0-1)', minimum: 0, maximum: 1 }),
  }), { description: 'Portfolio holdings for risk analysis' }),
  riskMetrics: SchemaProps.stringArray({ description: 'Risk metrics to compute (var, es, cva, market, credit, operational)' }),
  confidenceLevel: SchemaProps.number({ description: 'Confidence level for VaR/ES (0-1)', minimum: 0, maximum: 1, default: 0.95 }),
  timeHorizon: SchemaProps.integer({ description: 'Time horizon in days', minimum: 1, default: 252 }),
});

const riskRegulatoryAdvisoryOutputSchema = financeResultSchema(
  'Risk and regulatory assessment: VaR/expected shortfall, CVA, market/credit/operational risk breakdown, '
  + 'an overall risk score and classification, concentration indicators, and stress-test scenario results',
);

const RISK_REGULATORY_ADVISORY_CONFIG_SCHEMA = {
  type: 'object',
  properties: {
    baseUrl: { type: 'string', format: 'uri', description: 'Base URL for the risk assessment service' },
    apiKey: { type: 'string', description: 'API key for the risk assessment service' },
    provider: { type: 'string', description: 'Provider identifier (e.g., bloomberg, refinitiv, custom)' },
  },
  required: ['baseUrl', 'apiKey', 'provider'],
};

const riskRegulatoryAdvisorySkill = createDeclarativeCodeSkill({
  id: 'risk-regulatory-advisory',
  name: 'Risk & Regulatory Advisory',
  description: 'Assess financial and regulatory risk (VaR, ES, CVA, market/credit/operational) with stress testing and concentration analysis on a periodic schedule.',
  persistenceEnvVar: 'FINANCE_HOME',
  tier: 'advise',
  domainKnowledge: 'risk-management',
  inputSchema: riskRegulatoryAdvisoryInputSchema,
  outputSchema: riskRegulatoryAdvisoryOutputSchema,
  isSkill: true,
  manifest: {
  // Declared as a credential so the key can come from the vault and is never
  // read from, or echoed back out of, the process environment.
  credentialSource: {
    apiKey: { configKey: 'apiKey', required: false, label: "risk service API key (set in this Skill configuration, or a vault secret)" },
  },
    configSchema: RISK_REGULATORY_ADVISORY_CONFIG_SCHEMA,
  },
  handler: async function handler(input, ctx) {
      const NL = '\n';

      // The store path is reported back to the caller so a persisted assessment can be
      // located, but the store itself is owned by ctx.store, which resolves the
      // directory from FINANCE_HOME and creates it as needed.
      function storePath(): string {
        return ctx.store.getFilePath('risk-assessments');
      }

      function loadStore(): any {
        let store: any = null;
        try { store = ctx.store.load('risk-assessments', null); } catch (e) {}
        if (!store || typeof store !== 'object' || !Array.isArray(store.assessments)) {
          store = { assessments: [], lastUpdated: new Date().toISOString() };
        }
        return store;
      }

      function saveAssessment(entry: any): void {
        try {
          const store = loadStore();
          store.assessments.push(entry);
          store.lastUpdated = new Date().toISOString();
          ctx.store.save('risk-assessments', store);
        } catch (e) {
          // A failed write must not change the reported outcome of the assessment itself.
          // The assessment result is still honest and still reported; only the audit
          // trail is lost, so the failure is not surfaced as the skill's error.
        }
      }

      // Endpoint from this Skill's configuration; the secret through the
      // declared credential source. Neither comes from the process environment.
      const endpointUrl = String(input.endpointUrl || ctx.config?.endpointUrl || '');
      const apiKey = String((ctx.getCredential ? ctx.getCredential('apiKey') : undefined) || '');

      if (!endpointUrl) {
        const present = [{ id: 'not-connected', title: 'Not connected', kind: 'text', body: 'Risk assessment endpoint is not configured. Set FINANCE_RISK_ENDPOINT to enable full risk assessment.' }];
        return { success: false, status: 'not-connected', data: null, error: 'Not connected: FINANCE_RISK_ENDPOINT is not configured', present };
      }

      const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey };
      const body = JSON.stringify({ operation: 'risk-assessment', ...input });

      let res: any;
      let data: any;
      try {
        res = await fetch(endpointUrl, { method: 'POST', headers, body });
      } catch (err) {
        const message = (err as any) && (err as any).message ? (err as any).message : String(err);
        const present = [{ id: 'external-error', title: 'Risk assessment failed', kind: 'text', body: message }];
        // Persist failure record for auditing
        const entry = { id: 'ra_err_' + Buffer.from(String(new Date().getTime())).toString('base64').slice(0, 12), createdAt: new Date().toISOString(), inputs: input, error: message };
        saveAssessment(entry);
        return { success: false, status: 'failed', error: message, data: { riskAssessment: entry, storePath: storePath() }, present };
      }

      // The transport succeeded, so the body is read here. A body that cannot be read is
      // still a failure of this run, and it is reported the same way as a transport
      // failure rather than being silently downgraded to an empty result.
      const contentType = (res.headers && res.headers.get('content-type')) || '';
      try {
        if (contentType.includes('application/json')) { data = await res.json(); }
        else { const text = await res.text(); data = text ? { text } : null; }
      } catch (err) {
        const message = (err as any) && (err as any).message ? (err as any).message : String(err);
        const present = [{ id: 'external-error', title: 'Risk assessment failed', kind: 'text', body: message }];
        const entry = { id: 'ra_err_' + Buffer.from(String(new Date().getTime())).toString('base64').slice(0, 12), createdAt: new Date().toISOString(), inputs: input, error: message };
        saveAssessment(entry);
        return { success: false, status: 'failed', error: message, data: { riskAssessment: entry, storePath: storePath() }, present };
      }

      // Build a deterministic presentation block summarizing the external response
      const summaryParts = [];
      if (data && typeof data === 'object') {
        if (data.overallStatus) summaryParts.push('Status: ' + String(data.overallStatus));
        if (data.summary) summaryParts.push(String(data.summary));
      }
      summaryParts.push('Assessed entity: ' + (input.entityId || 'unspecified'));
      const present = [{ id: 'risk-regulatory-advisory', title: 'Risk & Regulatory Advisory Summary', kind: 'text', body: summaryParts.join(NL) }];

      // Persist risk assessment so downstream skills/UI can retrieve it
      const entry = { id: 'ra_' + Buffer.from(String(new Date().getTime())).toString('base64').slice(0, 12), createdAt: new Date().toISOString(), inputs: input, result: data };
      saveAssessment(entry);

      return { success: res.ok, status: res.ok ? 'ok' : 'failed', data: { riskAssessment: entry, storePath: storePath() }, error: res.ok ? null : 'Risk endpoint responded with status ' + res.status, present };
    }
  });

riskRegulatoryAdvisorySkill.configSchema = RISK_REGULATORY_ADVISORY_CONFIG_SCHEMA as any;

riskRegulatoryAdvisorySkill.triggers = [
  { kind: 'schedule', cadence: 'periodic risk/regulatory monitoring' },
];

export { riskRegulatoryAdvisorySkill };
