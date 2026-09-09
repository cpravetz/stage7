import { ToolRegistry } from '../services/ToolRegistry';
import { ToolExecutor } from '../services/ToolExecutor';
import { PluginGenerator } from '../services/PluginGenerator';

export const toolRegistry = new ToolRegistry();
export const toolExecutor = new ToolExecutor(toolRegistry.getMap());
export const pluginGenerator = new PluginGenerator();

pluginGenerator.setRegistry(toolRegistry);
