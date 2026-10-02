// @ts-nocheck
import { SchemaProps, createDeclarativeCodeSkill, createSchemaRecord } from '../code-skill-factory';
import { DISASTER_PROVIDERS } from './cto-contract';

export const CTO_INCIDENT_DISASTER_READINESS = (() => { const t = createDeclarativeCodeSkill({
  id: 'cto-incident-disaster-readiness',
  name: 'Incident & Disaster Readiness',
  description: 'Hybrid skill for disaster recovery operations and incident readiness checks',
  persistenceEnvVar: 'CTO_HOME',
  manifest: {},
  inputSchema: createSchemaRecord({
    provider: SchemaProps.select(DISASTER_PROVIDERS, {
      description: 'Disaster recovery provider to use',
      required: true,
    }),
    config: SchemaProps.object({}, {
      description: 'Operation-specific configuration',
      additionalProperties: true,
    }),
  }, { required: ['provider', 'config'] }),
  outputSchema: createSchemaRecord({
    success: SchemaProps.boolean({ description: 'Whether the operation succeeded' }),
    provider: SchemaProps.text({ description: 'Provider that was used' }),
    config: SchemaProps.object({}, { description: 'Configuration used', additionalProperties: true }),
    result: SchemaProps.object({}, { description: 'Operation result data', additionalProperties: true }),
    error: SchemaProps.text({ description: 'Error message if failed' }),
    present: SchemaProps.objectArray(SchemaProps.object({
      id: SchemaProps.text({}),
      title: SchemaProps.text({}),
      kind: SchemaProps.text({}),
      body: SchemaProps.text({}),
    }), { description: 'Pre-formatted user-facing output blocks' }),
  }),
  tier: 'aid',
  domainKnowledge: 'Incident response runbooks, disaster recovery planning, RTO/RPO targets, and service continuity',
  handler: async function handler(input, ctx) {
    const DISASTER_PROVIDERS = ['disaster-recovery'];
    const provider = input.provider;
    const config = input.config || {};

    if (!provider || !DISASTER_PROVIDERS.includes(provider)) {
      return { success: false, provider, config, error: 'Invalid or missing provider. Must be one of: ' + DISASTER_PROVIDERS.join(', ') };
    }

    return { success: false, provider, config, error: 'Not connected: disaster recovery module unavailable' };
  },
  }); (t as any).isSkill = false; return t; })();
