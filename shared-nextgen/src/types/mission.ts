import { z } from 'zod';

export const MissionArtifactSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  type: z.string().optional(),
  mediaType: z.string().optional(),
  mimeType: z.string().optional(),
  contentType: z.string().optional(),
  content: z.unknown().optional(),
  data: z.unknown().optional(),
  contentEncoding: z.string().optional(),
  url: z.string().optional(),
  purpose: z.enum(['workproduct', 'deliverable', 'execution-outcome']).optional(),
  isDeliverable: z.boolean().optional(),
  status: z.string().optional(),
  visibility: z.string().optional(),
  artifactId: z.string().optional(),
  logicalId: z.string().optional(),
  lineageId: z.string().optional(),
  version: z.union([z.string(), z.number()]).optional(),
  versionOf: z.string().optional(),
  isLatest: z.boolean().optional(),
  createdAt: z.string().optional(),
  phaseId: z.string().optional(),
  phaseName: z.string().optional(),
  taskId: z.string().optional(),
  taskTitle: z.string().optional(),
  taskStatus: z.string().optional(),
}).passthrough();

export const RequiredActionBindingSchema = z.object({
  operation: z.string().trim().min(1).max(120).optional(),
  operations: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  recipient: z.string().trim().min(1).max(500).optional(),
  recipients: z.array(z.string().trim().min(1).max(500)).max(50).optional(),
  message: z.string().trim().min(1).max(4000).optional(),
  subject: z.string().trim().min(1).max(1000).optional(),
  body: z.string().trim().min(1).max(4000).optional(),
}).passthrough();

export const RequiredActionSchema = z.object({
  toolId: z.string().trim().min(1).max(120),
  outcome: z.enum(['success', 'failure', 'denied']),
}).merge(RequiredActionBindingSchema).extend({
  binding: RequiredActionBindingSchema.optional(),
}).passthrough();

export const ActionReceiptBindingSchema = z.object({
  operation: z.string().optional(),
  recipients: z.array(z.string()).optional(),
  message: z.string().optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
  providerRequestId: z.string().optional(),
  executionId: z.string().optional(),
}).passthrough();

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  agentRole: z.string(),
  systemPrompt: z.string(),
  dependsOnTaskIds: z.array(z.string()).optional(),
  expectedArtifacts: z.array(z.string()).optional(),
  requiresExternalAction: z.boolean().optional(),
  requiredActions: z.array(RequiredActionSchema).max(50).optional(),
  status: z.enum(['pending', 'in_progress', 'awaiting_approval', 'completed', 'incomplete', 'failed', 'skipped']),
  output: z.string().optional(),
  artifacts: z.array(MissionArtifactSchema).default([]),
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
  estimatedDuration: z.string().optional(),
  estimatedCost: z.string().optional(),
  requiresClarification: z.boolean().default(false),
  clarificationQuestions: z.array(z.string()).default([]),
  clarificationAnswers: z.array(z.string()).default([]),
  phases: z.array(PhaseSchema),
});

export type RequiredActionBinding = z.infer<typeof RequiredActionBindingSchema>;
export type RequiredAction = z.infer<typeof RequiredActionSchema>;
export type ActionReceiptBinding = z.infer<typeof ActionReceiptBindingSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type MissionArtifact = z.infer<typeof MissionArtifactSchema>;
export type Phase = z.infer<typeof PhaseSchema>;
export type Plan = z.infer<typeof PlanSchema>;
