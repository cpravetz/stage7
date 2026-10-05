/**
 * Assistant Development Kit — public surface.
 *
 * `ADK_OVERVIEW.md` is the architecture; this module is what an Assistant author
 * imports. The split is deliberate: a blueprint file imports from here to build
 * its Skills and manifests, and the runtime imports from here to enforce the
 * rules, so neither can drift from the other.
 */

export {
  GOVERNANCE_TIERS,
  isGovernanceTier,
  type GovernanceTier,
  type AssistantManifest,
  type AssistantBlueprint,
  type ExecutionContext,
  type RenderBlock,
  type SkillExecutionResult,
  type SkillBlueprint,
  allBlueprintSkills,
} from './types';

export {
  MANIFEST_FILENAME,
  KNOWLEDGE_DIRNAME,
  PROMPTS_DIRNAME,
  SKILLS_DIRNAME,
  TOOLS_DIRNAME,
  parseManifest,
  describeManifest,
  type ManifestIssue,
} from './manifest';

export {
  deriveApproval,
  requiresApproval,
  mayDeliverExternally,
  gateOf,
  gateFieldsFor,
  assertNoManualGate,
  assertNoGateOptOutConfig,
  type ApprovalGate,
} from './gates';

export {
  SCHEMA_VERSION_KEY,
  UPDATED_AT_KEY,
  createHydrationRegistry,
  registerAdapters,
  getAdapters,
  readSchemaVersion,
  stampForWrite,
  hydrateDocument,
  hydrateAll,
  type HydrationAdapter,
  type HydrationRegistry,
  type HydrationOutcome,
} from './schema-version';

export {
  TRIGGER_KINDS,
  validateNativeTriggers,
  createDynamicTriggerRecord,
  dynamicRunRequiresApproval,
  dynamicRunGate,
  effectiveTriggers,
  type DynamicTriggerRecord,
  type TriggerKind,
  type TriggerIssue,
} from './triggers';

export {
  COMPLETION_EVENT_SUFFIX,
  completionEventId,
  emittedEventId,
  emittedEventIds,
  hasDeclaredEvent,
  altersData,
  buildCompletionEvents,
  declaredEventIds,
  isDryRun,
  subscriberMatches,
  type SkillEvent,
  type EventKind,
} from './events';

export {
  parseCron,
  isValidCron,
  type CronSchedule,
} from './cron';

export {
  buildScheduledTriggers,
  dueTriggers,
  isDue,
  scheduleStatus,
  DEFAULT_CATCH_UP_MS,
  type BlueprintScheduleCandidate,
  type ScheduledTrigger,
  type ScheduleIssue,
  type ScheduleSet,
  type ScheduleStatus,
} from './trigger-schedule';

export {
  classifyFailure,
  backoffDelay,
  withDeterministicRetry,
  withSelfCorrection,
  escalationCard,
  sanitizeForUser,
  type FailureClass,
  type ClassifiedFailure,
} from './resilience';

export { createExecutionContext, type ExecutionContextPorts, type StorePort } from './context';

export {
  loadBlueprint,
  inspectLayout,
  expectedSubfolder,
  readSystemPrompt,
  readDomainKnowledge,
  REQUIRED_FOLDERS,
  type BlueprintLoadResult,
  type FolderLayoutReport,
} from './blueprint';

export {
  validateBlueprint,
  formatReport,
  scanForEnvVars,
  secretFlaggingFindings,
  referencedByCanonicalSkill,
  declaresEmitEvent,
  type RuleId,
  type ValidationFinding,
  type ValidationReport,
} from './validate';

export {
  ASSISTANT_IDS,
  ASSISTANTS_DIRNAME,
  createCatalog,
  registerAssistant,
  getBlueprint,
  allCatalogSkills,
  allCanonicalSkills,
  validateCatalog,
  catalogManifests,
  freezeTool,
  type AssistantId,
  type AssistantCatalog,
  type AssistantRegistration,
} from './catalog';

export * from './builders';
export * from './contracts';
export * from './classification';
