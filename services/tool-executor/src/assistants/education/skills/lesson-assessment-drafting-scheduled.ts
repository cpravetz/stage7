import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';

/**
 * Scheduled half of the education-lesson-assessment-drafting split.
 *
 * Identifies courses in the configured set that have no assessment drafted yet
 * and drafts one per gap. `courseId` is a required selector so the sweep is
 * scoped to known courses rather than the whole catalogue.
 */
export const LESSON_ASSESSMENT_DRAFTING_SCHEDULED = createDeclarativeCodeSkill({
  id: 'education-lesson-assessment-drafting-scheduled',
  name: 'Lesson & Assessment Sweep',
  description: 'Scheduled sweep of configured courses, drafting assessments for courses that have none.',
  persistenceEnvVar: 'EDUCATION_HOME',
  tier: 'represent',
  isSkill: true,
  domainKnowledge: 'Curriculum standards alignment, lesson design, assessment authoring, and rubric construction for teacher review',
  inputSchema: {
    type: 'object',
    properties: {
      runReason: SchemaProps.text({ description: 'Why this run was invoked (schedule, manual)' }),
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean', description: 'Whether the sweep ran and stored its result' },
      data: { type: 'object', description: 'Sweep summary and the gaps it filled' },
      error: { type: 'string', description: 'Validation or generation error when unsuccessful' },
    },
    required: ['success'],
  },
  configSchema: {
    type: 'object',
    properties: {
      courseId: { type: 'array', items: { type: 'string' }, description: 'Course store keys in scope for this sweep' },
      gradeLevels: { type: 'array', items: { type: 'string' }, description: 'Only sweep courses in these grade levels' },
      cadence: { type: 'string', description: 'Cron expression or schedule id for this run' },
    },
    required: ['courseId'],
    additionalProperties: false,
  },
  triggers: [
    { kind: 'schedule', cadence: 'Weekly assessment gap sweep (Mondays 05:00)' },
  ],
  manifest: {},
  handler: async function handler(input, ctx) {
    const courseIds = Array.isArray(ctx.config?.courseId) ? (ctx.config!.courseId as unknown[]).map(String) : [];
    const gradeLevels = Array.isArray(ctx.config?.gradeLevels) ? (ctx.config!.gradeLevels as unknown[]).map(String) : [];
    const cadence = typeof ctx.config?.cadence === 'string' ? ctx.config.cadence : null;
    const runReason = typeof input?.runReason === 'string' ? input.runReason : 'schedule';

    const drafts: Array<Record<string, any>> = ctx.store.load('drafts', []);
    const existingCourseIds = new Set(
      (drafts as Array<Record<string, any>>)
        .filter((d: Record<string, any>) => d?.courseId)
        .map((d: Record<string, any>) => String(d.courseId)),
    );

    const inScope: string[] = [];
    const outOfScope: string[] = [];
    const alreadyCovered: string[] = [];
    const gaps: string[] = [];
    const drafted: Array<Record<string, unknown>> = [];

    for (const courseId of courseIds) {
      const course = ctx.store.load(courseId, null);
      if (!course) {
        outOfScope.push(courseId);
        continue;
      }
      const grade = String(course.grade ?? course.gradeLevel ?? '');
      if (gradeLevels.length && grade && !gradeLevels.includes(grade)) {
        outOfScope.push(courseId);
        continue;
      }
      inScope.push(courseId);
      if (existingCourseIds.has(courseId)) {
        alreadyCovered.push(courseId);
        continue;
      }
      gaps.push(courseId);
      const record = {
        id: `draft_${courseId}_${Date.now()}`,
        courseId,
        task: 'quiz',
        subject: course.subject ?? '',
        grade,
        topic: course.topic ?? course.title ?? '',
        source: 'scheduled-sweep',
        runReason,
        createdAt: new Date().toISOString(),
        // Flagged rather than implied: this draft is a placeholder outline from
        // course metadata, not a teacher-reviewed assessment.
        requiresTeacherReview: true,
      };
      drafts.push(record);
      drafted.push({ courseId, draftId: record.id });
    }

    ctx.store.save('drafts', drafts);

    const summary = {
      runReason,
      cadence,
      gradeLevels,
      configuredCourses: courseIds.length,
      inScope: inScope.length,
      outOfScope,
      alreadyCovered,
      gapsFilled: drafted.length,
      drafted,
    };

    return {
      success: true,
      data: summary,
      present: [
        ctx.render.text(
          'report',
          'Assessment Gap Sweep',
          `Swept ${inScope.length} course(s); ${drafted.length} needed an assessment and ${alreadyCovered.length} already had one. All drafts need teacher review.`,
        ),
      ],
    };
  },
});