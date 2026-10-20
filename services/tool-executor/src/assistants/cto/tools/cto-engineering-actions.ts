// @ts-nocheck

import { SchemaProps, createExternalActionSkill, createSchemaRecord } from '../../../adk/code-skill-factory';
import { ENG_PROVIDERS } from '../cto-contract';

export const CTO_ENGINEERING_ACTIONS = (() => { const t = createExternalActionSkill({
  id: 'cto-engineering-actions',
  isSkill: false,
  name: 'Engineering Actions',
  description: 'Mutating actions against external engineering systems (Jira, PagerDuty, GitHub Write). Requires confirmation before execution.',
  system: 'engineering',
  action: 'execute',
  // A capability that declares a mutating external action has to say how it is
  // pointed at the system, or the Run form asks for everything per run and the
  // base URL is never persisted.
  configSchema: createSchemaRecord({
    endpointUrl: SchemaProps.url({ description: 'Base URL of the engineering system this Skill acts on' }),
  }),
  endpointConfigKey: 'endpointUrl',
  inputSchema: createSchemaRecord({
    provider: SchemaProps.select(ENG_PROVIDERS, {
      description: 'External engineering system to act upon',
      required: true,
    }),
    action: SchemaProps.text({
      description: 'Specific action to perform (e.g., create-issue, acknowledge-incident, create-pr)',
      required: true,
    }),
    params: SchemaProps.object({}, {
      description: 'Action-specific parameters',
      additionalProperties: true,
    }),
    dryRun: SchemaProps.boolean({
      description: 'If true, simulate the action without making changes',
      default: true,
    }),
  }, { required: ['provider', 'action'] }),
  outputSchema: createSchemaRecord({
    success: SchemaProps.boolean({ description: 'Whether the action succeeded' }),
    system: SchemaProps.text({ description: 'System that was targeted' }),
    action: SchemaProps.text({ description: 'Action that was performed' }),
    request: SchemaProps.object({
      input: SchemaProps.object({}, { additionalProperties: true }),
      endpoint: SchemaProps.text({}),
      method: SchemaProps.text({}),
      headers: SchemaProps.object({}, { additionalProperties: true }),
    }, { description: 'Request details' }),
    response: SchemaProps.object({
      status: SchemaProps.number({}),
      data: SchemaProps.object({}, { additionalProperties: true }),
    }, { description: 'Response from the external system' }),
    error: SchemaProps.text({ description: 'Error message if failed' }),
    present: SchemaProps.objectArray(SchemaProps.object({
      id: SchemaProps.text({}),
      title: SchemaProps.text({}),
      kind: SchemaProps.text({}),
      body: SchemaProps.text({}),
    }), { description: 'Pre-formatted user-facing output blocks' }),
  }),
  manifest: {
    persistenceEnvVar: 'CTO_HOME',
    emitEvent: 'cto.engineering_action.executed',
  },
  tier: 'represent',
  domainKnowledge: 'Engineering system mutation conventions, change management, rollback planning, and confirmation gating',
  }); (t as any).isSkill = false; return t; })();
