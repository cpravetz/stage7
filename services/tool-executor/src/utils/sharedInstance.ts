import { ToolRegistry } from '../services/ToolRegistry';
import { ToolStore } from '../services/ToolStore';
import { ToolExecutor } from '../services/ToolExecutor';
import { AssistantWorkspaceManager } from '../services/AssistantWorkspaceManager';
import { PluginGenerator } from '../services/PluginGenerator';

export const toolStore = new ToolStore();
export const toolRegistry = new ToolRegistry(toolStore);
export const workspaceManager = new AssistantWorkspaceManager();
export const executor = new ToolExecutor(toolRegistry.getMap(), workspaceManager);
export const pluginGenerator = new PluginGenerator();

pluginGenerator.setRegistry(toolRegistry);
