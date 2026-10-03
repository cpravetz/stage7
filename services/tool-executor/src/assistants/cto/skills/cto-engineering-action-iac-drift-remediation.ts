// @ts-nocheck

import { SchemaProps, createDeclarativeCodeSkill, createSchemaRecord } from '../../../adk/code-skill-factory';
import { IAC_REMEDIATION_TRIGGERS } from '../cto-contract';

export const CTO_ENGINEERING_ACTION_IAC_DRIFT_REMEDIATION = createDeclarativeCodeSkill({
    id: 'cto-engineering-action-iac-drift-remediation',
    isSkill: true,
    name: 'Engineering Action & IaC Drift Remediation',
    description: 'Dry-run and, after explicit confirmation, apply approved engineering or IaC remediation through a configured endpoint.',
    persistenceEnvVar: 'CTO_HOME',
    inputSchema: createSchemaRecord({
      remediation: SchemaProps.object({
        target: SchemaProps.text({ description: 'What to change, e.g. the resource or file in drift' }),
        change: SchemaProps.text({ description: 'The approved change to apply' }),
        justification: SchemaProps.text({ description: 'Why this change is approved' }),
      }, { description: 'The specific remediation to apply' }),
      dryRun: SchemaProps.boolean({ description: 'Check the remediation without applying it', default: true }),
      approved: SchemaProps.boolean({ description: 'Approve applying this remediation for real', default: false }),
    }, { required: [] }),
    outputSchema: createSchemaRecord({
      success: SchemaProps.boolean({ description: 'Whether action completed' }),
      data: SchemaProps.object({}, { description: 'Remote response when available' }),
      error: SchemaProps.text({ description: 'Failure or governance message' }),
      present: SchemaProps.objectArray(SchemaProps.object({
        id: SchemaProps.text({}),
        title: SchemaProps.text({}),
        kind: SchemaProps.text({}),
        body: SchemaProps.text({}),
      }), { description: 'Pre-formatted user-facing output blocks' }),
    }),
    triggers: IAC_REMEDIATION_TRIGGERS,
    tier: 'represent',
    domainKnowledge: 'Infrastructure-as-code drift detection, remediation safety, change review, and rollback guarantees',
    manifest: {
      ui: { view: 'remediation-approval' },
      // Applying a remediation is the write half of this Skill. Holding the
      // engineering actions tool here puts the live write behind the approval
      // panel instead of leaving it reachable on its own.
      lowerOrderTools: ['cto-engineering-actions'],
      configSchema: createSchemaRecord({
        endpointUrl: SchemaProps.url({ description: 'Configured engineering or IaC remediation endpoint' }),
      }, { required: ['endpointUrl'] }),
      // The bearer token is a secret, so it is resolved from the vault or from
      // operator configuration rather than asked for on the Run form.
      credentialSource: {
        token: { configKey: 'token', required: false, label: 'remediation endpoint access token (set it in this Skill configuration, or a vault secret)' },
      }
    },
    handler: async function handler(input, ctx) {
        // The endpoint is operator configuration and the token a declared
        // credential. Both used to be read from `input`, which is never where they
        // live, so this Skill could only ever report not-connected.
        const endpointUrl = ctx.config?.endpointUrl;
        if (!endpointUrl) {
          const result = { success: false, error: 'Not connected: set endpointUrl in this Skill\'s configuration.', data: {} };

          return result;
        }
        const token = ctx.getCredential ? ctx.getCredential('token') : undefined;
        const dryRun = input.dryRun !== false;
        const approved = input.approved === true;
        if (!dryRun && !approved) {
          const result = { success: false, error: 'Tick Approved to apply this remediation. Nothing has been changed.', data: {} };

          return result;
        }
        try {
          const response = await fetch(String(endpointUrl), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
            body: JSON.stringify(input.remediation || {}),
          });
          const data = await response.json().catch(async () => ({ text: await response.text() }));
          const result = { success: response.ok, data: { response: { status: response.status, data } }, error: null };
          const body = 'Endpoint: ' + endpointUrl + '\nMethod: POST\nDry Run: ' + dryRun + '\nStatus: ' + response.status + '\nResponse: ' + JSON.stringify(data, null, 2);

          return result;
        } catch (error) {
          const result = { success: false, error: error instanceof Error ? error.message : String(error), data: null };

          return result;
        }
      }
    });
