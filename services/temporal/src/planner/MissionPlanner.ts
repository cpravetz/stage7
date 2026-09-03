import { Plan, PlanSchema } from '@stage7-nextgen/shared';
import { logger } from '@stage7-nextgen/shared';

const PLANNER_SYSTEM_PROMPT = `You are a mission planner for an AI agent platform. Given a user's goal, you produce a structured plan with phases, tasks, and the agent roles needed to execute them.

Your job is to:
1. Understand the goal.
2. Decide if you need clarification. If the goal is ambiguous (missing critical info like target market, budget, timeline, product type, or business model), set requiresClarification=true and ask 2-4 focused questions. Otherwise set requiresClarification=false.
3. Decompose the goal into 3-7 phases. Each phase has a clear deliverable.
4. For each phase, break it into specific tasks (1-5 per phase). Each task has a single agent role, a clear description, and expected artifacts.
5. For each task, write a systemPrompt for the agent that will execute it — the agent's persona, expertise, and instructions.
6. Mark requiresApproval=true on phases that produce something the user should review before continuing (e.g. vision, plan, major artifacts, the final business setup before launch).

Common agent roles:
- founder: business vision, strategy, overall plan
- researcher: market research, competitor analysis
- marketer: marketing strategy, content, channels
- product-dev: product design, MVP, technical specs
- sales: sales pipeline, pricing, customer acquisition
- support: customer support setup, FAQs
- analyst: financial projections, metrics
- copywriter: website copy, content
- designer: brand, visual identity

Output a single JSON object matching the schema. Do not include any prose outside the JSON.`;

function buildFallbackPlan(prompt: string): Plan {
  return {
    summary: `Plan for: ${prompt.slice(0, 100)}`,
    estimatedDuration: '1-2 weeks',
    estimatedCost: '$0 (bootstrap)',
    requiresClarification: false,
    clarificationQuestions: [],
    phases: [
      {
        id: 'phase-1',
        name: 'Vision & Strategy',
        goal: 'Define business vision and strategy',
        tasks: [
          {
            id: 'task-1-1',
            title: 'Founder vision definition',
            description: 'Create a clear vision for the online business',
            agentRole: 'founder',
            systemPrompt: 'You are the founder. Define a clear vision for a bootstrap online business.',
            expectedArtifacts: ['vision.md'],
            status: 'pending',
            artifacts: [],
          },
        ],
        requiresApproval: true,
        status: 'pending',
      },
      {
        id: 'phase-2',
        name: 'Marketing Setup',
        goal: 'Set up marketing channels and content',
        tasks: [
          {
            id: 'task-2-1',
            title: 'Marketing strategy',
            description: 'Develop marketing strategy using free resources',
            agentRole: 'marketer',
            systemPrompt: 'You are the marketer. Create a marketing strategy using free and open resources.',
            expectedArtifacts: ['marketing-strategy.md'],
            status: 'pending',
            artifacts: [],
          },
        ],
        requiresApproval: false,
        status: 'pending',
      },
      {
        id: 'phase-3',
        name: 'Product Development',
        goal: 'Build MVP product or service',
        tasks: [
          {
            id: 'task-3-1',
            title: 'MVP development plan',
            description: 'Plan the minimum viable product using free tools',
            agentRole: 'product-dev',
            systemPrompt: 'You are the product developer. Plan an MVP using free and open tools.',
            expectedArtifacts: ['mvp-plan.md'],
            status: 'pending',
            artifacts: [],
          },
        ],
        requiresApproval: true,
        status: 'pending',
      },
      {
        id: 'phase-4',
        name: 'Sales & Support',
        goal: 'Set up sales pipeline and customer support',
        tasks: [
          {
            id: 'task-4-1',
            title: 'Sales pipeline setup',
            description: 'Create a sales pipeline and pricing strategy',
            agentRole: 'sales',
            systemPrompt: 'You are the sales agent. Create a sales pipeline and pricing strategy.',
            expectedArtifacts: ['sales-plan.md'],
            status: 'pending',
            artifacts: [],
          },
          {
            id: 'task-4-2',
            title: 'Customer support setup',
            description: 'Set up customer support with FAQs and automation',
            agentRole: 'support',
            systemPrompt: 'You are the support agent. Set up customer support workflows.',
            expectedArtifacts: ['support-setup.md'],
            status: 'pending',
            artifacts: [],
          },
        ],
        requiresApproval: false,
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
