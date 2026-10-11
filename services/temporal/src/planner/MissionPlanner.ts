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

  async generatePlan(prompt: string, context?: Record<string, unknown>, missionId?: string): Promise<Plan> {
    try {
      const res = await fetch(`${this.brainUrl}/api/brain/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `GOAL: ${prompt}\n\nCONTEXT: ${JSON.stringify(context || {})}`,
          systemPrompt: PLANNER_SYSTEM_PROMPT,
          maxTokens: 4096,
          temperature: 0.3,
          missionId,
        }),
      });
      const raw = await res.text();
      if (!res.ok) throw new Error(`Brain returned ${res.status}: ${raw.slice(0, 500)}`);

      let data: { content?: string };
      try {
        data = JSON.parse(raw) as { content?: string };
      } catch {
        data = { content: raw };
      }
      const jsonMatch = (data.content || '').match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Brain response did not contain a JSON plan');

      const validated = PlanSchema.parse(JSON.parse(jsonMatch[0]));
      logger.info({ missionGoal: prompt.slice(0, 50), phases: validated.phases.length }, 'Plan generated');
      return validated;
    } catch (err) {
      logger.warn(
        { missionId, err: err instanceof Error ? err.message : String(err) },
        'Planner request failed; using fallback plan',
      );
      return buildFallbackPlan(prompt);
    }
  }
}
