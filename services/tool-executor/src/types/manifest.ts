import { z } from 'zod';
import { NativeExecutorKey, SchemaRecord, SkillTrigger } from './index';

// Skills put many custom keys in manifest (lowerOrderTools,
// actionLabel, system, action, configSchema, credentialSource, source,
// packageName, timeoutMs, ...), so unknown keys must be preserved verbatim.
export const baseManifestSchema = z.object({}).catchall(z.unknown());

const nativeExecutorValues: NativeExecutorKey[] = [
  'search',
  'weather',
  'math',
  'files',
  'ftp',
  'webhook',
  'database',
  'email',
  'vendor',
  'data_analysis',
  'calendar',
  'api_client',
];

const vendorValues = ['jira', 'confluence', 'slack', 'github'] as const;

const toolManifestSchema = baseManifestSchema
  .refine((manifest) => {
    const type = manifest?.type as string | undefined;
    if (type === 'native') {
      const executor = manifest?.executor as string | undefined;
      return executor ? nativeExecutorValues.includes(executor as NativeExecutorKey) : false;
    }
    return true;
  }, { message: 'type "native" requires manifest.executor to be a valid NativeExecutorKey' })
  .refine((manifest) => {
    const type = manifest?.type as string | undefined;
    if (type === 'code') {
      return Boolean(manifest?.language || manifest?.sourceCode);
    }
    return true;
  }, { message: 'type "code" requires manifest.language or manifest.sourceCode' })
  .refine((manifest) => {
    const type = manifest?.type as string | undefined;
    if (type === 'mcp') {
      return Boolean(manifest?.server);
    }
    return true;
  }, { message: 'type "mcp" requires manifest.server' })
  .refine((manifest) => {
    const type = manifest?.type as string | undefined;
    if (type === 'openapi') {
      return Boolean(manifest?.urlTemplate);
    }
    return true;
  }, { message: 'type "openapi" requires manifest.urlTemplate' })
  .refine((manifest) => {
    const executor = manifest?.executor as string | undefined;
    if (executor === 'vendor') {
      const vendor = manifest?.vendor as string | undefined;
      return vendor ? vendorValues.includes(vendor as typeof vendorValues[number]) : false;
    }
    return true;
  }, { message: 'executor "vendor" requires manifest.vendor to be one of: jira, confluence, slack, github' });

export type ToolManifest = z.infer<typeof toolManifestSchema>;

const passthroughSchema = z.object({}).catchall(z.unknown());

export const createToolSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: z.enum(['mcp', 'openapi', 'code', 'reasoning', 'native']),
  manifest: toolManifestSchema,
  inputSchema: passthroughSchema.optional(),
  outputSchema: passthroughSchema.optional(),
  configSchema: passthroughSchema.optional(),
  triggers: z.array(z.custom<SkillTrigger>()).optional(),
  reasoningConfig: passthroughSchema.optional(),
  externalConfig: passthroughSchema.optional(),
  confirmBeforeSend: z.boolean().optional(),
  isSkill: z.boolean().optional(),
});

export type CreateToolInput = z.infer<typeof createToolSchema>;

export { toolManifestSchema };
