import express from 'express';
import workerPoolRoutes from './routes/worker-pool';
import assistantRoutes from './routes/assistants';
import { assistantLoader, knowledgeService, persistence } from './utils/sharedInstance';
import { buildAssistantManifest, hasManifestSelection, getManifestValidationError } from './data/assistantManifest';
import { toStoredAuthoredEntry } from './data/assistantKnowledge';
import type { AssistantDefinition } from '@stage7-nextgen/shared';
import { logger } from './utils/logger';
import { registerAssistantTools } from './shared/mcp';

const app: express.Application = express();
app.use(express.json());

/**
 * Publishes each assistant's authored knowledge from its file into the shared
 * knowledge store. Runs on every boot so that editing a knowledge file takes
 * effect on restart, and is idempotent so it is safe to repeat.
 */
async function syncAuthoredKnowledge(catalog: AssistantDefinition[]): Promise<void> {
  let published = 0;
  for (const assistant of catalog) {
    for (const entry of assistant.knowledge ?? []) {
      await knowledgeService.publish(toStoredAuthoredEntry(assistant.id, entry), assistant.tenantId);
      published++;
    }
  }
  logger.info({ published }, 'Authored assistant knowledge synced to knowledge store');
}

async function initializeAssistants(): Promise<void> {
  // The backing store must be settled before any write, otherwise writes during
  // startup land in the in-memory store and are dropped when it is replaced.
  await persistence.ready();

  // If MONGO_URI is set but unreachable, this process would run on a volatile
  // in-memory store and every knowledge write would be lost on restart. Refuse
  // to start rather than run with data that cannot survive.
  if (persistence.isDegraded()) {
    const err = persistence.getMongoError();
    throw new Error(
      'MONGO_URI is configured but MongoDB is unreachable, so assistant knowledge would be ' +
      `stored in memory and lost on restart. Refusing to start. Underlying error: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  if (!persistence.isDurable()) {
    logger.warn(
      'MONGO_URI is not set; assistant knowledge is held in memory and will not survive a restart',
    );
  }

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

  // Assistants come from folders on disk. manifest.catalog is that set already
  // narrowed by STAGE7_ASSISTANTS, so there is no second list of what exists:
  // the folders are the inventory, and an unselected folder is simply one the
  // operator did not ask for.
  const catalog = manifest.catalog;

  if (existing.length === 0) {
    if (catalog.length > 0) {
      logger.info(
        { count: catalog.length, source: 'assistants/<id>/assistant.json' },
        'Seeding assistant catalog from discovered assistant folders',
      );
    } else {
      logger.warn('No assistant folders were discovered; initialization is robust to an empty catalog');
    }

    for (const assistant of catalog) {
      const saved = await assistantLoader.register(assistant);
      if (saved.tools && saved.tools.length > 0) {
        registerAssistantTools(saved.tools);
      }
    }

    logger.info({ count: assistantLoader.list().length }, 'Assistant catalog seeded');
  } else {
    logger.info({ count: existing.length }, 'Assistants already persisted, registering tools and reconciling catalog');

    // Register tools from persisted assistants (what's already stored)
    for (const assistant of existing) {
      if (assistant.tools && assistant.tools.length > 0) {
        registerAssistantTools(assistant.tools);
      }
    }

    // Reconcile the on-disk catalog with persisted assistants. This repairs
    // cases where an assistant was previously persisted without its canonical
    // tool bindings (for example after a manual migration or bad earlier run).
    // Only repair when the persisted assistant has no tools so we avoid
    // overwriting deliberate admin edits.
    for (const assistantDef of catalog) {
      const stored = assistantLoader.get(assistantDef.id);
      if (!stored) {
        // New assistant folder appeared since the last run; register it now.
        const saved = await assistantLoader.register(assistantDef);
        if (saved.tools && saved.tools.length > 0) {
          registerAssistantTools(saved.tools);
        }
        continue;
      }

      // Restore missing tool bindings when the persisted assistant has none.
      if ((!stored.tools || stored.tools.length === 0) && assistantDef.tools && assistantDef.tools.length > 0) {
        const updates: Partial<AssistantDefinition> = {
          tools: assistantDef.tools,
          // Keep other stored metadata unless absent; only inject canonical tools.
        };
        const updated = await assistantLoader.update(assistantDef.id, updates);
        if (updated && updated.tools && updated.tools.length > 0) {
          registerAssistantTools(updated.tools);
        }
        logger.info({ assistantId: assistantDef.id }, 'Repaired assistant tools from on-disk catalog');
      }
    }
  }

  // Sync the knowledge for the assistants this instance is actually running.
  await syncAuthoredKnowledge(catalog);
}

app.use('/api/workers', workerPoolRoutes);
app.use('/api/workers', assistantRoutes);

const PORT = process.env.PORT || 3200;

// Do not accept traffic until the catalog is seeded and knowledge is synced.
// Serving requests with an unsynced knowledge store would mean answering with
// a prompt that is missing knowledge the assistant is supposed to have.
initializeAssistants()
  .then(() => {
    logger.info({ assistants: assistantLoader.list().length }, 'Worker Pool ready');
    app.listen(PORT, () => {
      logger.info({ port: PORT, assistants: assistantLoader.list().length }, 'WorkerPool service listening');
    });
  })
  .catch((err) => {
    logger.error({ err }, 'Worker Pool failed to initialize; not starting');
    process.exit(1);
  });

export default app;
