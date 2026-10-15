import { z } from 'zod';

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  agentRole: z.string(),
  systemPrompt: z.string(),
  dependsOnTaskIds: z.array(z.string()).optional(),
  expectedArtifacts: z.array(z.string()),
  requiredActions: z.array(z.object({
    toolId: z.string().trim().min(1).max(120),
    outcome: z.enum(['success', 'failure', 'denied']),
  }).strict()).max(50).optional(),
  status: z.enum(['pending', 'in_progress', 'awaiting_approval', 'completed', 'failed', 'skipped']),
  output: z.string().optional(),
  artifacts: z.array(z.object({
    name: z.string(),
    type: z.string(),
    content: z.string(),
  })).default([]),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
});

export const PhaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  goal: z.string(),
  tasks: z.array(TaskSchema),
  requiresApproval: z.boolean().default(true),
  approvalQuestion: z.string().optional(),
  status: z.enum(['pending', 'in_progress', 'awaiting_approval', 'approved', 'rejected', 'completed']).default('pending'),
  approvedAt: z.number().optional(),
  approvedBy: z.string().optional(),
  rejectionReason: z.string().optional(),
});

export const PlanSchema = z.object({
  summary: z.string(),
  estimatedDuration: z.string(),
  estimatedCost: z.string(),
  requiresClarification: z.boolean().default(false),
  clarificationQuestions: z.array(z.string()).default([]),
  phases: z.array(PhaseSchema),
});

export type Task = z.infer<typeof TaskSchema>;
export type Phase = z.infer<typeof PhaseSchema>;
export type Plan = z.infer<typeof PlanSchema>;
