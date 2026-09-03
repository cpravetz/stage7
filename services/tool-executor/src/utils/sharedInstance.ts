import { ToolRegistry } from '../services/ToolRegistry';
import { ToolExecutor } from '../services/ToolExecutor';
import { PluginGenerator } from '../services/PluginGenerator';

export const toolRegistry = new ToolRegistry();
export const toolExecutor = new ToolExecutor();
export const pluginGenerator = new PluginGenerator();
