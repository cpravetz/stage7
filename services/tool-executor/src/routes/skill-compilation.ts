import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import type { SkillCategory, TrajectoryAgentRole } from '@stage7-nextgen/shared';
import { MissionToSkillCompiler } from '../adk/compilers/mission-skill-compiler';
import { toolRegistry } from '../utils/sharedInstance';
import asyncHandler from '../utils/asyncHandler';

const roles: TrajectoryAgentRole[] = [
  'Coordinator',
  'Researcher',
  'Creative',
  'Critic',
  'Executor',
  'Domain Expert',
  'Coder',
  'Analyst',
  'Product Manager',
];
const categories: SkillCategory[] = [
  'analytics', 'career', 'content', 'cto', 'education', 'event', 'executive',
  'finance', 'general', 'healthcare', 'hotel', 'hr', 'investment', 'legal', 'marketing',
  'product', 'restaurant', 'sales', 'scriptwriting', 'songwriting', 'sports', 'support',
];
const trajectorySchema = z.object({
  missionId: z.string().min(1).max(200),
  assistantId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  goalDescription: z.string().min(1).max(10_000),
  steps: z.array(z.object({
    stepId: z.string().min(1).max(200),
    agentRole: z.enum(roles as [TrajectoryAgentRole, ...TrajectoryAgentRole[]]),
    toolName: z.string().min(1).max(200),
    inputParameters: z.record(z.unknown()),
    outputResult: z.record(z.unknown()),
    executionDurationMs: z.number().nonnegative(),
    status: z.enum(['SUCCESS', 'FAILED']),
  })).max(500),
  finalDeliverableSummary: z.string().max(20_000),
  totalTokensUsed: z.number().int().nonnegative(),
});
const requestSchema = z.object({
  trajectory: trajectorySchema,
  targetSkillName: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  targetCategory: z.enum(categories as [SkillCategory, ...SkillCategory[]]),
  description: z.string().min(1).max(1000),
  authorAssistantId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  enforceStrictSchemas: z.boolean().default(true),
});

const router = Router();
const compiler = new MissionToSkillCompiler();

router.post('/compile-skill', asyncHandler(async (req, res) => {
  const request = requestSchema.parse(req.body);
  const { module, tool } = await compiler.compileTrajectoryToADKSkill(request);
  const skillsDir = join(
    __dirname,
    '../../src/assistants',
    request.authorAssistantId,
    'skills',
    'generated',
  );
  await mkdir(skillsDir, { recursive: true });
  await writeFile(join(skillsDir, `${module.skillId}.ts`), module.typescriptSourceCode, 'utf8');

  toolRegistry.registerOrReplace(tool);
  res.status(201).json({ skill: module });
}));

export default router;
