import { AgentRuntime } from '../services/AgentRuntime';
import { AgentDefinition } from '../types';

export const runtime = new AgentRuntime();

const defaultAgents: AgentDefinition[] = [
  {
    id: 'worker-agent',
    tenantId: 'system',
    name: 'Worker Agent',
    description: 'Executes assigned tasks and workflows',
    type: 'worker',
    systemPrompt: 'You are a worker agent. Execute the tasks assigned to you efficiently and accurately.',
    model: 'openai/gpt-4o-mini',
    tools: [],
    metadata: { category: 'worker' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'supervisor-agent',
    tenantId: 'system',
    name: 'Supervisor Agent',
    description: 'Coordinates and supervises other agents',
    type: 'supervisor',
    systemPrompt: 'You are a supervisor agent. Coordinate tasks among worker agents and ensure quality.',
    model: 'anthropic/claude-3.5-sonnet',
    tools: [],
    metadata: { category: 'supervisor' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'research-agent',
    tenantId: 'system',
    name: 'Research Agent',
    description: 'Conducts research and analysis',
    type: 'researcher',
    systemPrompt: 'You are a research agent. Investigate topics thoroughly and synthesize findings.',
    model: 'google/gemini-2.0-flash-exp',
    tools: [],
    metadata: { category: 'research' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
]

defaultAgents.forEach((a) => runtime.registerAgent(a))
