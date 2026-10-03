// @ts-nocheck

import { SchemaProps, createDeclarativeCodeSkill, createSchemaRecord } from '../../../adk/code-skill-factory';
import { INFRA_PROVIDERS } from '../cto-contract';

export const CTO_INFRASTRUCTURE_QUERY = (() => { const t = createDeclarativeCodeSkill({
  id: 'cto-infrastructure-query',
  isSkill: false,
  name: 'Infrastructure Query',
  description: 'Read-only queries across infrastructure providers (Datadog, AWS, GCP, Azure, Kubernetes, Service Mesh, Cost Optimization, IaC Monitoring, Database Operations, Team Metrics, GitHub Read)',
  persistenceEnvVar: 'CTO_HOME',
  manifest: {},
  inputSchema: createSchemaRecord({
    provider: SchemaProps.select(INFRA_PROVIDERS, {
      description: 'Infrastructure provider to query',
      required: true,
    }),
    query: SchemaProps.text({
      description: 'Query string or structured query object for the provider',
      required: true,
    }),
    options: SchemaProps.object({}, {
      description: 'Additional provider-specific options',
      additionalProperties: true,
    }),
  }, { required: ['provider', 'query'] }),
  outputSchema: createSchemaRecord({
    success: SchemaProps.boolean({ description: 'Whether the query succeeded' }),
    provider: SchemaProps.text({ description: 'Provider that was queried' }),
    query: SchemaProps.text({ description: 'Original query' }),
    result: SchemaProps.object({}, { description: 'Query result data', additionalProperties: true }),
    error: SchemaProps.text({ description: 'Error message if failed' }),
    present: SchemaProps.objectArray(SchemaProps.object({
      id: SchemaProps.text({}),
      title: SchemaProps.text({}),
      kind: SchemaProps.text({}),
      body: SchemaProps.text({}),
    }), { description: 'Pre-formatted user-facing output blocks' }),
  }),
  tier: 'advise',
  domainKnowledge: 'Infrastructure querying conventions, observability tooling, cloud provider operations, and cost visibility',
  handler: async function handler(input, ctx) {
    const INFRA_PROVIDERS = ['datadog','aws','gcp','azure','kubernetes','service-mesh','cost-optimization','iac-monitoring','database-operations','team-metrics','github-read'];
    const provider = input.provider;
    const query = input.query;

    if (!provider || !INFRA_PROVIDERS.includes(provider)) {
      return { success: false, provider, query, error: 'Invalid or missing provider. Must be one of: ' + INFRA_PROVIDERS.join(', ') };
    }

    return { success: false, provider, query, error: 'Not connected: provider module unavailable for ' + provider };
  },
  }); (t as any).isSkill = false; return t; })();
