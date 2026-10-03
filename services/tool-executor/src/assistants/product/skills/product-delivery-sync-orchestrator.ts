import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';

/**
 * Delivery state sync across the internal delivery tools.
 *
 * v9 §2: a `represent` Skill that reaches external systems and mutates there.
 * The three writes this orchestrates — Jira, Confluence and Slack — are each
 * individually `represent`, and orchestrating them does not lower the bar: the
 * whole point of the Skill is that one approval covers a coordinated set of
 * writes, not that it can make three writes where each previously needed one.
 *
 * The Skill never writes directly. It delegates to the delivery tools, so the
 * per-tool gates and credential handling stay where they are defined rather
 * than being reimplemented here.
 */
const DELIVERY_SYNC = createDeclarativeCodeSkill({
  id: 'product-delivery-sync-orchestrator',
  name: 'Delivery Sync Orchestrator',
  description:
    'Fans a feature status change out across Jira, Confluence and Slack by delegating to the delivery tools, and reports per-target what actually landed. Defaults to dry run; a live sync requires confirmation. A target that is not configured is reported as not-connected rather than skipped silently.',
  persistenceEnvVar: 'PRODUCT_HOME',
  emitEvent: 'product.feature_status.synced',
  inputSchema: {
    type: 'object',
    properties: {
      featureId: { type: 'string', description: 'Feature being synced' },
      featureName: { type: 'string', description: 'Human-readable feature name' },
      targetState: {
        type: 'string',
        enum: ['backlog', 'planned', 'in-progress', 'in-review', 'blocked', 'released'],
        description: 'State to publish',
      },
      targets: {
        type: 'array',
        items: { type: 'string', enum: ['jira', 'confluence', 'slack'] },
        description: 'Which systems to sync; defaults to all three',
      },
      message: { type: 'string', description: 'Announcement text for the team-facing targets', multiline: true },
      releaseNotes: { type: 'string', description: 'Notes to publish on release', multiline: true },
      dryRun: SchemaProps.boolean({ description: 'Report the fan-out without performing any write' }),
    },
    required: ['featureId', 'targetState'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      status: { type: 'string' },
      data: { type: ['object', 'null'] },
      error: { type: ['string', 'null'] },
      present: {
        type: 'array',
        description: 'Pre-formatted, user-facing text blocks',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            kind: { type: 'string' },
            body: { type: 'string' },
          },
          required: ['id', 'body'],
        },
      },
    },
    required: ['success', 'status', 'data', 'error', 'present'],
  },
  triggers: [
    { kind: 'event', on: 'Feature status updated', eventId: 'product.jira.issue_updated' },
    {
      kind: 'user',
      phrase_examples: ['Sync this feature to released', 'Push the status change to Jira and Slack'],
    },
  ],
  tier: 'represent',
  domainKnowledge:
    'Product delivery operations: feature state transitions, release communication, cross-tool consistency, and rollout sequencing across Jira, Confluence and Slack',
  isSkill: true,
  manifest: {
    actionLabel: 'Sync delivery status',
    lowerOrderTools: ['product-jira', 'product-confluence', 'product-slack'],
  },
  handler: async function handler(input, ctx) {
    const NL = '\n';
    const featureId = String(input.featureId || '').trim();
    const targetState = String(input.targetState || '').trim();

    if (!featureId || !targetState) {
      return {
        success: false,
        status: 'blocked',
        data: null,
        error: 'Both featureId and targetState are required; there is nothing to sync.',
        present: [
          {
            id: 'notice',
            title: 'Nothing to sync',
            kind: 'text',
            body: 'Supply featureId and targetState — the feature and the state to publish.',
          },
        ],
      };
    }

    const requested = Array.isArray(input.targets) && input.targets.length
      ? (input.targets as string[])
      : ['jira', 'confluence', 'slack'];
    const dryRun = input.dryRun !== false;
    const featureName = String(input.featureName || featureId);

    // What each target needs differs, and sending it the same payload is how a
    // sync ends up writing a release note into a chat channel.
    const buildPayload = (target: string): Record<string, unknown> => {
      const base: Record<string, unknown> = { featureId, featureName, targetState };
      if (target === 'jira') return { ...base, transition: targetState };
      if (target === 'confluence') return { ...base, page: featureName, content: input.releaseNotes || '' };
      return { ...base, text: input.message || `${featureName} is now ${targetState}.` };
    };

    const results: Record<string, { status: string; detail: string }> = {};

    for (const target of requested) {
      const payload = buildPayload(target);
      if (dryRun) {
        results[target] = {
          status: 'dry-run',
          detail: `would send ${JSON.stringify(payload)}`,
        };
        continue;
      }
      const delegated = await ctx.delegate(`product-${target}`, payload);
      if (!delegated || delegated.success === false) {
        // Not-connected and failed are different facts; collapsing them is how a
        // broken integration reads as a successful sync.
        results[target] = {
          status: delegated && delegated.status === 'not-connected' ? 'not-connected' : 'error',
          detail: String((delegated && delegated.error) || 'The delivery tool returned no result.'),
        };
      } else {
        results[target] = { status: delegated.status || 'ok', detail: 'written' };
      }
    }

    const failed = Object.entries(results).filter(([, r]) => r.status === 'error');
    const notConnected = Object.entries(results).filter(([, r]) => r.status === 'not-connected');

    const lines: string[] = [];
    lines.push(`Delivery Sync — ${featureName}`);
    lines.push('='.repeat(`Delivery Sync — ${featureName}`.length));
    lines.push('');
    lines.push(`Feature: ${featureId}`);
    lines.push(`State:   ${targetState}`);
    lines.push(`Mode:    ${dryRun ? 'dry-run (no target written)' : 'live'}`);
    lines.push('');
    for (const [target, r] of Object.entries(results)) {
      lines.push(`  ${target.padEnd(12)} ${r.status.padEnd(14)} ${r.detail}`);
    }
    lines.push('');

    if (failed.length) {
      lines.push(`${failed.length} target(s) failed. The others were written; the feature state`);
      lines.push('is now inconsistent between systems and needs a re-sync.');
    } else if (notConnected.length && !dryRun) {
      lines.push(`${notConnected.length} target(s) are not configured. Nothing was written there,`);
      lines.push('and this is reported rather than passed over.');
    } else if (dryRun) {
      lines.push('No target was written. Confirm to perform the sync.');
    }

    ctx.store.save('delivery-syncs', [
      ...(ctx.store.load('delivery-syncs', []) || []),
      { featureId, featureName, targetState, targets: requested, results, createdAt: new Date().toISOString() },
    ]);

    return {
      success: failed.length === 0,
      status: failed.length ? 'error' : dryRun ? 'dry-run' : 'ok',
      data: {
        featureId,
        featureName,
        targetState,
        targets: requested,
        results,
        sent: !dryRun,
        failedTargets: failed.map(([t]) => t),
        notConnectedTargets: notConnected.map(([t]) => t),
        storePath: ctx.store.getFilePath('delivery-syncs'),
        source: 'supplied-input',
      },
      error: failed.length ? `${failed.length} target(s) failed: ${failed.map(([t]) => t).join(', ')}` : null,
      present: [
        { id: 'sync', title: `Delivery Sync — ${featureName}`, kind: 'text', body: lines.join(NL) },
      ],
    };
  },
});

export { DELIVERY_SYNC };
