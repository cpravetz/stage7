import { LLMProvider } from './Provider';
import { OpenAICompatibleProvider } from './OpenAICompatibleProvider';
import { logger } from '../utils/logger';

export interface CustomProviderSpec {
  prefix: string;
  id: string;
  name: string;
  apiKey: string;
  apiBase: string;
  listModelsPath?: string;
}

function sanitizePrefix(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

export function parseCustomProviderSpecs(existingIds: Set<string> = new Set()): CustomProviderSpec[] {
  const raw = process.env.CUSTOM_PROVIDERS;
  if (!raw || !raw.trim()) return [];

  const prefixes = raw
    .split(',')
    .map(sanitizePrefix)
    .filter(Boolean);

  const seen = new Set<string>();
  const specs: CustomProviderSpec[] = [];

  for (const prefix of prefixes) {
    if (seen.has(prefix)) {
      logger.warn({ prefix }, 'CUSTOM_PROVIDERS: duplicate prefix, skipping');
      continue;
    }
    seen.add(prefix);

    const apiKey = process.env[`${prefix}_API_KEY`];
    const apiName = process.env[`${prefix}_API_NAME`];
    const apiBase = process.env[`${prefix}_API_URL`];

    if (!apiKey) {
      logger.warn({ prefix }, 'CUSTOM_PROVIDERS: provider missing API key, skipping');
      continue;
    }

    if (!apiBase) {
      logger.warn({ prefix }, 'CUSTOM_PROVIDERS: provider missing API URL, skipping');
      continue;
    }

    const id = prefix.toLowerCase();
    if (existingIds.has(id) || seen.has(id.toLowerCase())) {
      logger.warn({ provider: id }, 'CUSTOM_PROVIDERS: provider id conflicts with an existing provider, skipping');
      continue;
    }

    specs.push({
      prefix,
      id,
      name: apiName || id,
      apiKey,
      apiBase,
      listModelsPath: process.env[`${prefix}_LIST_MODELS_PATH`] || '/models',
    });
  }

  return specs;
}

export function buildCustomProvidersFromEnv(existingIds: Set<string> = new Set()): LLMProvider[] {
  const specs = parseCustomProviderSpecs(existingIds);
  return specs.map((spec) => {
    const provider = new OpenAICompatibleProvider({
      id: spec.id,
      name: spec.name,
      apiBase: spec.apiBase,
      apiKey: spec.apiKey,
      defaultModels: [],
      listModelsPath: spec.listModelsPath,
    });
    logger.info({ provider: spec.id, name: spec.name, url: spec.apiBase }, 'Registered custom OpenAI-compatible provider');
    return provider;
  });
}
