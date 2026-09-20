import express from 'express';
import workerPoolRoutes from './routes/worker-pool';
import assistantRoutes from './routes/assistants';
import { assistantLoader } from './utils/sharedInstance';
import { canonicalAssistantCatalog } from './data/canonicalAssistantCatalog';
import { buildAssistantManifest, hasManifestSelection, getManifestValidationError } from './data/assistantManifest';
import { logger } from './utils/logger';
import { registerAssistantTools } from './shared/mcp';

const app: express.Application = express();
app.use(express.json());

async function initializeAssistants(): Promise<void> {
  const existing = assistantLoader.list();
  const manifest = buildAssistantManifest(process.env.STAGE7_ASSISTANTS);

  if (hasManifestSelection(manifest)) {
    const validationError = getManifestValidationError(manifest);
    if (validationError) {
      logger.error({ error: validationError }, 'STAGE7_ASSISTANTS validation failed');
      throw new Error(validationError);
    }
    logger.info({ selected: manifest.validIds.length }, 'STAGE7_ASSISTANTS manifest active, filtering catalog');
  }

  if (existing.length === 0) {
    const catalog = hasManifestSelection(manifest) ? manifest.catalog : undefined;
    if (catalog && catalog.length > 0) {
      logger.info({ count: catalog.length }, 'Seeding assistant catalog from manifest selection');
      for (const assistant of catalog) {
        const saved = await assistantLoader.register(assistant);
        if (saved.tools && saved.tools.length > 0) {
          registerAssistantTools(saved.tools);
        }
      }
    } else if (catalog && catalog.length === 0) {
      logger.warn('STAGE7_ASSISTANTS manifest produced empty catalog; no assistants seeded');
    } else {
      logger.info({ count: canonicalAssistantCatalog.length }, 'Seeding assistant catalog from canonical definitions');
      for (const assistant of canonicalAssistantCatalog) {
        const saved = await assistantLoader.register(assistant);
        if (saved.tools && saved.tools.length > 0) {
          registerAssistantTools(saved.tools);
        }
      }
    }

    if ((catalog?.length ?? canonicalAssistantCatalog.length) === 0) {
      logger.warn('No assistant catalogs available to seed; initialization is robust to empty catalogs');
    }

    logger.info({ count: assistantLoader.list().length }, 'Assistant catalog seeded');
  } else {
    logger.info({ count: existing.length }, 'Assistants already persisted, registering tools');
    for (const assistant of existing) {
      if (assistant.tools && assistant.tools.length > 0) {
        registerAssistantTools(assistant.tools);
      }
    }
  }
}

initializeAssistants().then(() => {
  logger.info({ assistants: assistantLoader.list().length }, 'Worker Pool ready');
});

app.use('/api/workers', workerPoolRoutes);
app.use('/api/workers', assistantRoutes);

const PORT = process.env.PORT || 3200;

app.listen(PORT, () => {
  logger.info({ port: PORT, assistants: assistantLoader.list().length }, 'WorkerPool service listening');
});

export default app;
