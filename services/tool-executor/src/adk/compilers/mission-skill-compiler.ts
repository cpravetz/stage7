import { createHash } from 'node:crypto';
import { Script } from 'node:vm';
import { z } from 'zod';
import type {
  CompiledADKSkillModule,
  SkillCompilationRequest,
  SkillCategory,
} from '@stage7-nextgen/shared';
import { createCodeSkill } from '../code-skill-factory';
import type { Tool } from '../../types';

const fieldSchema = z.record(z.enum(['string', 'number', 'boolean', 'array', 'object']));
const synthesisSchema = z.object({
  skillName: z.string().regex(/^[a-z0-9-]{1,64}$/),
  description: z.string().min(1).max(500),
  inputSchemaFields: fieldSchema,
  outputSchemaFields: fieldSchema,
  implementation: z.string().min(1).max(32_000),
  requiredEnvVars: z.array(z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/)).max(32),
});

const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_TIMEOUT_MS = 60_000;

function toSchema(fields: Record<string, string>): Record<string, unknown> {
  return {
    type: 'object',
    properties: Object.fromEntries(
      Object.entries(fields).map(([name, type]) => [
        name,
        type === 'array' || type === 'object' ? { type } : { type },
      ]),
    ),
    required: Object.keys(fields),
    additionalProperties: false,
  };
}

function buildSource(
  skillId: string,
  assistantId: string,
  category: SkillCategory,
  synthesis: z.infer<typeof synthesisSchema>,
  inputSchema: Record<string, unknown>,
  outputSchema: Record<string, unknown>,
): string {
  const identifier = `skill_${synthesis.skillName.replace(/[^a-zA-Z0-9_$]/g, '_')}`;
  return `import { createCodeSkill } from '../../../../adk/code-skill-factory';

export const ${identifier} = createCodeSkill({
  id: ${JSON.stringify(skillId)},
  name: ${JSON.stringify(synthesis.skillName)},
  description: ${JSON.stringify(synthesis.description)},
  domainKnowledge: ${JSON.stringify(`Generated for assistant ${assistantId}; category ${category}`)},
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: ${JSON.stringify(synthesis.implementation)},
    generatedBy: 'mission-to-skill-compiler',
    authorAssistantId: ${JSON.stringify(assistantId)},
    generatedSkillCategory: ${JSON.stringify(category)},
    credentialSource: ${JSON.stringify(Object.fromEntries(
      synthesis.requiredEnvVars.map((name) => [name, { envVar: name, required: true }]),
    ))},
    timeoutMs: 30000,
  },
  inputSchema: ${JSON.stringify(inputSchema)},
  outputSchema: ${JSON.stringify(outputSchema)},
  isSkill: true,
  timeoutMs: 30000,
});
`;
}

export class MissionToSkillCompiler {
  private readonly brainUrl: string;

  constructor(brainUrl = process.env.BRAIN_URL || 'http://brain:3100') {
    this.brainUrl = brainUrl.replace(/\/+$/, '');
  }

  async compileTrajectoryToADKSkill(
    request: SkillCompilationRequest,
  ): Promise<{ module: CompiledADKSkillModule; tool: Tool }> {
    const successfulSteps = request.trajectory.steps.filter((step) => step.status === 'SUCCESS');
    if (successfulSteps.length === 0) {
      throw new Error(
        `[ADK Compiler Error] Cannot compile skill from mission ${request.trajectory.missionId}: no successful trajectory steps.`,
      );
    }
    if (!SAFE_ID.test(request.targetSkillName) || !SAFE_ID.test(request.authorAssistantId)) {
      throw new Error('targetSkillName and authorAssistantId must be lowercase kebab-case identifiers.');
    }
    if (request.authorAssistantId !== request.trajectory.assistantId) {
      throw new Error('authorAssistantId must match the assistantId in the mission trajectory.');
    }

    const prompt = [
      `Compile a reusable Stage7 skill for the goal: ${request.trajectory.goalDescription}`,
      `Description: ${request.description}`,
      `Category: ${request.targetCategory}`,
      'Use only successful trajectory steps and preserve their demonstrated behavior.',
      'Return a JavaScript script body that reads input from __tool_input and prints one JSON result.',
      'The script must not use process.env for secrets; read any approved credentials from __skill_credentials.',
      'The schema field values must be one of string, number, boolean, array, object.',
      'Return exactly these JSON fields: skillName, description, inputSchemaFields, outputSchemaFields, implementation, requiredEnvVars.',
      `Successful trajectory: ${JSON.stringify(successfulSteps)}`,
      `Deliverable summary: ${request.trajectory.finalDeliverableSummary}`,
    ].join('\n\n');
    const response = await fetch(`${this.brainUrl}/api/brain/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(35 * 60_000),
      body: JSON.stringify({
        prompt,
        systemPrompt: 'You synthesize reusable tools. Respond with only a JSON object matching the requested fields.',
        temperature: 0.2,
        maxTokens: 4096,
        missionId: request.trajectory.missionId,
        inputFormat: 'json',
        outputFormat: 'json',
      }),
    });
    if (!response.ok) {
      throw new Error(`Brain service rejected skill synthesis (${response.status}).`);
    }
    const completion = await response.json() as { content?: unknown };
    if (typeof completion.content !== 'string') {
      throw new Error('Brain service returned no structured skill synthesis content.');
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(completion.content);
    } catch (error) {
      throw new Error(`Brain service returned invalid JSON for skill synthesis: ${error instanceof Error ? error.message : String(error)}`);
    }
    const synthesis = synthesisSchema.parse(decoded);
    try {
      new Script(`(async () => { ${synthesis.implementation}\n})`);
    } catch (error) {
      throw new Error(`Brain service generated invalid JavaScript: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (request.enforceStrictSchemas && (
      Object.keys(synthesis.inputSchemaFields).length === 0
      || Object.keys(synthesis.outputSchemaFields).length === 0
    )) {
      throw new Error('Strict skill compilation requires non-empty input and output schemas.');
    }

    const skillHash = createHash('sha256').update(request.targetSkillName).digest('hex').slice(0, 12);
    const skillId = `generated-${request.authorAssistantId}-${skillHash}`;
    if (!SAFE_ID.test(skillId)) {
      throw new Error('Generated skill identifier is invalid.');
    }
    const inputSchema = toSchema(synthesis.inputSchemaFields);
    const outputSchema = toSchema(synthesis.outputSchemaFields);
    const source = buildSource(
      skillId,
      request.authorAssistantId,
      request.targetCategory,
      synthesis,
      inputSchema,
      outputSchema,
    );
    const tool = createCodeSkill({
      id: skillId,
      name: synthesis.skillName,
      description: synthesis.description,
      domainKnowledge: `Generated for assistant ${request.authorAssistantId}; category ${request.targetCategory}`,
      manifest: {
        language: 'javascript',
        entrypoint: 'index.js',
        sourceCode: synthesis.implementation,
        generatedBy: 'mission-to-skill-compiler',
        authorAssistantId: request.authorAssistantId,
        generatedSkillCategory: request.targetCategory,
        credentialSource: Object.fromEntries(
          synthesis.requiredEnvVars.map((name) => [name, { envVar: name, required: true }]),
        ),
        timeoutMs: 30_000,
      },
      inputSchema,
      outputSchema,
      isSkill: true,
      timeoutMs: 30_000,
    });

    return {
      module: {
        skillId,
        skillName: synthesis.skillName,
        typescriptSourceCode: source,
        inputSchemaZodRaw: JSON.stringify(synthesis.inputSchemaFields),
        outputSchemaZodRaw: JSON.stringify(synthesis.outputSchemaFields),
        environmentVariables: synthesis.requiredEnvVars,
        timeoutMs: Math.min(MAX_TIMEOUT_MS, 30_000),
        compilationTimestamp: new Date().toISOString(),
      },
      tool,
    };
  }
}
