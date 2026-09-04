import { Plan, PlanSchema } from '@stage7-nextgen/shared';
import { logger } from '@stage7-nextgen/shared';

const PLANNER_SYSTEM_PROMPT = `You are a mission planner for an AI agent platform. Given a user's goal, you produce a structured plan with phases, tasks, and the agent roles needed to execute them.

Your job is to:
1. Understand the goal.
2. Decide if you need clarification. If the goal is ambiguous, set requiresClarification=true and ask 2-4 focused questions. Otherwise set requiresClarification=false.
3. Decompose the goal into 3-7 phases. Each phase has a clear deliverable.
4. For each phase, break it into specific tasks (1-5 per phase). Each task has a single agent role, a clear description, and expected artifacts.
5. For each task, write a systemPrompt for the agent that will execute it.
6. Mark requiresApproval=true on phases that produce something the user should review before continuing.

Agent roles should be chosen based on the actual goal — e.g. "researcher" for research tasks, "coder" for software tasks, "writer" for content, "analyst" for data tasks, "planner" for strategy, "reviewer" for quality checks. Do not default to business/startup roles unless the goal is explicitly about business.

Output a single JSON object matching the schema. Do not include any prose outside the JSON.`;

function buildFallbackPlan(prompt: string): Plan {
  const trimmed = prompt.trim();
  return {
    summary: `Plan for: ${trimmed.slice(0, 100)}`,
    estimatedDuration: '1-2 days',
    estimatedCost: 'TBD',
    requiresClarification: false,
    clarificationQuestions: [],
    phases: [
      {
        id: 'phase-1',
        name: 'Planning',
        goal: `Break down and plan the execution of: ${trimmed.slice(0, 80)}`,
        tasks: [
          {
            id: 'task-1-1',
            title: 'Analyze goal and create execution plan',
            description: `Analyze the goal and create a concrete, step-by-step execution plan for: ${trimmed}`,
            agentRole: 'planner',
            systemPrompt: 'You are a planning agent. Analyze the goal and create a concrete, step-by-step execution plan. Be thorough and consider edge cases.',
            expectedArtifacts: ['plan.md'],
            status: 'pending',
            artifacts: [],
          },
        ],
        requiresApproval: true,
        status: 'pending',
      },
      {
        id: 'phase-2',
        name: 'Execution',
        goal: `Execute the plan to accomplish: ${trimmed.slice(0, 80)}`,
        tasks: [
          {
            id: 'task-2-1',
            title: 'Execute the plan',
            description: `Execute the previously created plan to accomplish: ${trimmed}`,
            agentRole: 'worker',
            systemPrompt: 'You are an execution agent. Execute the plan thoroughly and produce the required artifacts. If you need tools, use the available tool execution interface.',
            expectedArtifacts: ['output.md'],
            status: 'pending',
            artifacts: [],
          },
        ],
        requiresApproval: false,
        status: 'pending',
      },
      {
        id: 'phase-3',
        name: 'Review',
        goal: 'Review output quality and completeness',
        tasks: [
          {
            id: 'task-3-1',
            title: 'Review and refine output',
            description: 'Review the execution output for completeness, accuracy, and quality. Refine or request follow-up tasks if needed.',
            agentRole: 'reviewer',
            systemPrompt: 'You are a reviewer agent. Evaluate outputs for completeness, accuracy, and quality. Identify gaps and suggest improvements.',
            expectedArtifacts: ['review.md'],
            status: 'pending',
            artifacts: [],
          },
        ],
        requiresApproval: true,
        status: 'pending',
      },
    ],
  };
}

export class MissionPlanner {
  constructor(private brainUrl: string, private apiKey?: string) {}

  async generatePlan(prompt: string, context?: Record<string, unknown>): Promise<Plan> {
    const errors: string[] = [];
    const attempts = [
      { label: 'auto', body: { prompt: `GOAL: ${prompt}\n\nCONTEXT: ${JSON.stringify(context || {})}`, systemPrompt: PLANNER_SYSTEM_PROMPT, maxTokens: 4096, temperature: 0.3 } },
      { label: 'openwebui', body: { prompt: `GOAL: ${prompt}\n\nCONTEXT: ${JSON.stringify(context || {})}`, systemPrompt: PLANNER_SYSTEM_PROMPT, maxTokens: 4096, temperature: 0.3, provider: 'openwebui' } },
      { label: 'openrouter-fresh', body: { prompt: `GOAL: ${prompt}\n\nCONTEXT: ${JSON.stringify(context || {})}`, systemPrompt: PLANNER_SYSTEM_PROMPT, maxTokens: 4096, temperature: 0.3, provider: 'openrouter' } },
    ];
    let lastError: Error | null = null;
    for (const attempt of attempts) {
      try {
        const res = await fetch(`${this.brainUrl}/api/brain/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(attempt.body),
        });
        if (!res.ok) {
          const text = await res.text();
          errors.push(`[${attempt.label}] ${res.status}: ${text.slice(0, 200)}`);
          continue;
        }
        const data = await res.json() as { content: string };
        const jsonMatch = data.content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          logger.warn({ provider: attempt.label, content: data.content.slice(0, 200) }, 'Planner response had no JSON, using fallback plan');
          const fallback = buildFallbackPlan(prompt);
          logger.info({ missionGoal: prompt.slice(0, 50), phases: fallback.phases.length, provider: attempt.label, fallback: true }, 'Plan generated (fallback)');
          return fallback;
        }
        const parsed = JSON.parse(jsonMatch[0]);
        const validated = PlanSchema.parse(parsed);
        logger.info({ missionGoal: prompt.slice(0, 50), phases: validated.phases.length, provider: attempt.label }, 'Plan generated');
        return validated;
      } catch (err: any) {
        errors.push(`[${attempt.label}] ${err.message}`);
        lastError = err;
      }
    }
    logger.warn({ errors }, 'All planner attempts failed, using fallback plan');
    const fallback = buildFallbackPlan(prompt);
    logger.info({ missionGoal: prompt.slice(0, 50), phases: fallback.phases.length, fallback: true }, 'Plan generated (fallback after all attempts)');
    return fallback;
  }
}
