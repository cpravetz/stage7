import express from 'express';
import toolRoutes from './routes/tools';
import workflowRoutes from './routes/workflows';
import workspaceRoutes from './routes/workspaces';
import watchRoutes from './routes/watches';
import mcpServerRoutes from './routes/mcpServers';
import { Tool } from './types';
import { toolRegistry, toolStore } from './utils/sharedInstance';
import { legacyGeneralTools } from './data/generalTools';
import { nativeTools } from './data/nativeTools';
import logger from './utils/logger';
import { ToolNotFoundError, ValidationError } from './utils/errors';
import { PluginGenerator } from './services/PluginGenerator';

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason: String(reason) }, 'Unhandled Rejection');
});
process.on('uncaughtException', (error) => {
  logger.error({ error: error.message, stack: error.stack }, 'Uncaught Exception');
});

import {
  careerSkills,
  productSkills,
  contentSkills,
  legalSkills,
  salesSkills,
  educationSkills,
  hrSkills,
  executiveSkills,
  ctoSkills,
  hotelSkills,
  sportsSkills,
  eventSkills,
  marketingSkills,
  supportSkills,
  analyticsSkills,
  creativeSkills,
  financeSkills,
  healthcareSkills,
  restaurantSkills,
  investmentSkills,
  songwritingSkills,
  scriptwritingSkills,
} from './data/skills';
import {
  ctoCanonicalSkills,
  healthcareCanonicalSkills,
  restaurantCanonicalSkills,
  careerCanonicalSkills,
  hrCanonicalSkills,
} from './data/skills';
import {
  careerCanonicalExtendedSkills,
  careerCanonicalInternalTools,
} from './data/skills/career-canonical-extended';

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason: String(reason) }, 'Unhandled Rejection');
});
process.on('uncaughtException', (error) => {
  logger.error({ error: error.message, stack: error.stack }, 'Uncaught Exception');
});

const app: express.Application = express();
app.use(express.json());

const canonicalTools = [
  ...ctoCanonicalSkills,
  ...healthcareCanonicalSkills,
  ...restaurantCanonicalSkills,
  ...careerCanonicalSkills,
  ...careerCanonicalExtendedSkills,
  ...hrCanonicalSkills,
];

const canonicalIds = new Set(canonicalTools.map((t) => t.id));

const domainSkillArrays = [
  careerSkills,
  productSkills,
  contentSkills,
  legalSkills,
  salesSkills,
  educationSkills,
  hrSkills,
  executiveSkills,
  ctoSkills,
  hotelSkills,
  sportsSkills,
  eventSkills,
  marketingSkills,
  supportSkills,
  analyticsSkills,
  creativeSkills,
  financeSkills,
  healthcareSkills,
  restaurantSkills,
  investmentSkills,
  songwritingSkills,
  scriptwritingSkills,
];

const skillTools = domainSkillArrays.flatMap((arr) =>
  arr.filter((t) => !canonicalIds.has(t.id))
);

const allDefaults = [
  ...nativeTools,
  ...legacyGeneralTools,
  ...skillTools,
  ...canonicalTools,
  ...careerCanonicalInternalTools,
];

// A tool is exposed as a user-facing Skill when it has a user trigger, unless it
// is explicitly marked isSkill:false or it is a lower-order tool that wrappers
// delegate to via __execute_tool (and should not surface their own UX).
//
// Previously only canonicalIds (6 assistants: cto, healthcare, restaurant,
// career, career-extended, hr) were promoted to isSkill:true, which hid every
// Skill from the other 15 assistants entirely. The canonical set was also the
// wrong signal: it was an artifact of which assistants exported a
// canonicalSkills array, not a property of the tool itself.
const lowerOrderIds = new Set<string>();
for (const tool of allDefaults) {
  const lower = (tool.manifest?.lowerOrderTools as string[] | undefined) || [];
  for (const id of lower) if (id) lowerOrderIds.add(id);
}

for (const tool of allDefaults) {
  if (tool.isSkill === undefined) {
    const hasUserTrigger = (tool.triggers || []).some((trigger) => trigger.kind === 'user');
    tool.isSkill = hasUserTrigger && !lowerOrderIds.has(tool.id);
  }
  if (!toolRegistry.get(tool.id)) {
    // registerDefault: built-ins are never written to the runtime ToolStore.
    toolRegistry.registerDefault(tool);
  }
}
logger.info({ count: toolRegistry.list().length }, 'Registered default tools');

// Re-register tools that were created at runtime (POST /tools,
// POST /plugins/generate, ToolDiscovery) and persisted by ToolStore.
// Built-in defaults always win: a persisted copy whose id collides with a
// default is skipped, so a stale snapshot can never shadow a real tool.
{
  let restored = 0;
  let skipped = 0;
  let persisted: Tool[] = [];
  try {
    persisted = toolStore.loadAll();
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Failed to load persisted tool store');
  }
  for (const tool of persisted) {
    if (toolRegistry.get(tool.id)) {
      skipped++;
      continue;
    }
    try {
      toolRegistry.registerOrReplace(tool);
      restored++;
    } catch (err) {
      logger.warn({ toolId: tool.id, err: err instanceof Error ? err.message : String(err) }, 'Skipped persisted tool that failed to register');
    }
  }
  logger.info({ restored, skipped, total: persisted.length }, 'Hydrated persisted tools from store');
}

// Adopt plugins that were deployed to disk (PluginGenerator.deploy) so code
// tools survive a restart. Same skip-if-already-registered rule: each plugin
// directory is loaded in its own try/catch so one bad directory cannot stop boot.
{
  let adopted = 0;
  let skippedPlugins = 0;
  let deployed: Array<{ id: string; name: string; deployPath: string; language: string }> = [];
  try {
    deployed = PluginGenerator.listDeployed();
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Failed to list deployed plugins');
  }
  for (const plugin of deployed) {
    if (toolRegistry.get(plugin.id)) {
      skippedPlugins++;
      continue;
    }
    try {
      const tool = PluginGenerator.loadDeployed(plugin.id);
      if (!tool) continue;
      toolRegistry.registerOrReplace(tool);
      adopted++;
    } catch (err) {
      logger.warn({ pluginId: plugin.id, err: err instanceof Error ? err.message : String(err) }, 'Failed to adopt deployed plugin');
    }
  }
  logger.info({ adopted, skipped: skippedPlugins, total: deployed.length }, 'Adopted deployed plugins');
}

app.get('/api/tool-executor/health', (_req, res) => {
  res.json({ status: 'ok', service: 'tool-executor', tools: toolRegistry.list().length });
});

app.get('/api/tool-executor/tools', (_req, res) => {
  res.json({ tools: toolRegistry.list() });
});

app.use('/api/tool-executor', toolRoutes);
app.use('/api/tool-executor', mcpServerRoutes);
app.use('/api/tool-executor/workflows', workflowRoutes);
app.use('/api/tool-executor/workspaces', workspaceRoutes);
app.use('/api/tool-executor/watches', watchRoutes);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof ToolNotFoundError) {
    return res.status(404).json({ success: false, error: err.message, statusCode: 404 });
  }
  if (err instanceof ValidationError) {
    return res.status(400).json({ success: false, error: err.message, statusCode: 400 });
  }
  logger.error({ err: err?.message || String(err) }, 'Unhandled error in tool-executor');
  res.status(500).json({ success: false, error: err?.message || 'Internal server error', statusCode: 500 });
});

const PORT = process.env.PORT || 3500;

if (require.main === module) {
  app.listen(PORT, () => {
    logger.info({ port: PORT, tools: toolRegistry.list().length }, 'Tool Executor service listening');
  });
}

export { legacyGeneralTools } from './data/generalTools';
export {
  careerSkills,
  productSkills,
  contentSkills,
  legalSkills,
  salesSkills,
  educationSkills,
  hrSkills,
  executiveSkills,
  ctoSkills,
  hotelSkills,
  sportsSkills,
  eventSkills,
  marketingSkills,
  supportSkills,
  analyticsSkills,
  creativeSkills,
  financeSkills,
  healthcareSkills,
  restaurantSkills,
  investmentSkills,
  songwritingSkills,
  scriptwritingSkills,
} from './data/skills';
export {
  ctoCanonicalSkills,
  healthcareCanonicalSkills,
  restaurantCanonicalSkills,
  careerCanonicalSkills,
  hrCanonicalSkills,
} from './data/skills';
export {
  careerCanonicalExtendedSkills,
  careerCanonicalInternalTools,
} from './data/skills/career-canonical-extended';
export default app;
