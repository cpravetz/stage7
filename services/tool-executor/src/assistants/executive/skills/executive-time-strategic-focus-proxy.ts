// @ts-nocheck
import { Tool, SchemaRecord } from '../../../types';
import { createDeclarativeCodeSkill, createSchemaRecord, SchemaProps } from '../../../adk/code-skill-factory';
import { executiveResultSchema } from '../executive-contract';

function withUxMetadata(schema: SchemaRecord): SchemaRecord {
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!properties) return schema;
  Object.entries(properties).forEach(([key, property], index) => {
    if (!property || typeof property !== 'object') return;
    property.title = property.title || key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
    property.order = typeof property.order === 'number' ? property.order : index + 1;
    property.hint = property.hint || property.description || 'See the tool documentation for details.';
  });
  return schema;
}

const SAFETY_BOUNDARY = 'Executive time-strategic focus proxy: calendar management is advisory. Do not block or commit resources without explicit executive authorization.';

const TIME_INPUT = createSchemaRecord({
  action: SchemaProps.select(['analyze', 'protect-focus', 'resolve-conflict', 'delegate', 'optimize'], { description: 'Strategic focus action to perform', required: true }),
  calendarData: SchemaProps.text({ description: 'Calendar data (JSON string or object)', multiline: true }),
  focusBlocks: SchemaProps.objectArray(SchemaProps.object({
    title: SchemaProps.text({}),
    start: SchemaProps.text({}),
    end: SchemaProps.text({}),
    priority: SchemaProps.text({}),
    bufferMinutes: SchemaProps.integer({}),
  }), { description: 'Declared focus blocks' }),
  conflictResolutionRules: SchemaProps.stringArray({ description: 'Rules for resolving calendar conflicts in priority order' }),
  delegationRules: SchemaProps.stringArray({ description: 'Rules for delegating meetings to chief of staff' }),
  proposedFocusBlocks: SchemaProps.objectArray(SchemaProps.object({
    title: SchemaProps.text({}),
    start: SchemaProps.text({}),
    end: SchemaProps.text({}),
    priority: SchemaProps.text({}),
    bufferMinutes: SchemaProps.integer({}),
  }), { description: 'Proposed focus blocks to protect' }),
  conflictId: SchemaProps.text({ description: 'Identifier for a specific calendar conflict to resolve' }),
  meetingId: SchemaProps.text({ description: 'Identifier for a meeting to delegate or resolve' }),
  timeRange: SchemaProps.text({ description: 'Time range for analysis or optimization (e.g. 24 hours, week)' }),
  chiefOfStaffContact: SchemaProps.text({ description: 'Chief of staff contact information for delegation' }),
}, { required: ['action'] });

const TIME_CONFIG = createSchemaRecord({
  executiveHome: SchemaProps.text({ description: 'Executive workspace path; defaults to EXECUTIVE_HOME' }),
  defaultFocusBufferMinutes: SchemaProps.integer({ description: 'Default buffer in minutes around protected focus blocks' }),
  defaultConflictWindowHours: SchemaProps.integer({ description: 'Default lookahead window in hours for conflict detection' }),
  defaultDelegateRoles: SchemaProps.stringArray({ description: 'Default roles eligible for meeting delegation' }),
});

export const TIME_STRATEGIC_FOCUS_PROXY = createDeclarativeCodeSkill({
  id: 'executive-time-strategic-focus-proxy',
  name: 'Time & Strategic Focus Proxy',
  description: 'Manage executive calendar, protect strategic focus time, resolve conflicts, delegate meetings, and optimize the schedule.',
  persistenceEnvVar: 'EXECUTIVE_HOME',
  tier: 'represent',
  domainKnowledge: 'Executive calendar management, strategic focus protection, conflict resolution, meeting delegation, time optimization',
  inputSchema: TIME_INPUT,
  outputSchema: executiveResultSchema('Calendar analysis, focus protection plan, conflict resolution, delegation plan, or optimization results derived from supplied inputs'),
  triggers: [{ kind: 'event', on: 'calendar-conflict' }],
  confirmBeforeSend: true,
  isSkill: true,
  manifest: {
    configSchema: TIME_CONFIG,
    ui: { view: 'time-strategic-focus' }
  },
  handler: async function handler(input, ctx) {
      const NL = '\n';
      const SAFETY = "Executive time-strategic focus proxy: calendar management is advisory. Do not block or commit resources without explicit executive authorization.";

      function fail(status, message, title, extra) {
        const base = { success: false, status: status, error: message, data: null, present: [{ id: 'notice', title: title, kind: 'text', body: message + NL + NL + SAFETY }] };
        if (extra) { for (const key in extra) { base[key] = extra[key]; } }
        return base;
      }

      const action = input.action || 'analyze';
      let store = ctx.store.load('time-strategic-focus', []);

      function parseCalendar(data) {
        if (!data) return [];
        try { return JSON.parse(typeof data === 'string' ? data : JSON.stringify(data)); }
        catch (e) {
          if (Array.isArray(data)) return data;
          if (typeof data === 'object') return [data];
          return [];
        }
      }

      function formatFocusBlock(block, i) {
        const start = block.start || block.startTime || 'unspecified';
        const end = block.end || block.endTime || 'unspecified';
        const title = block.title || block.name || 'Focus Block ' + (i + 1);
        return '  Block ' + (i + 1) + ': ' + title + ' (' + start + ' - ' + end + ')' + (block.priority ? ' [Priority: ' + block.priority + ']' : '');
      }

      let result;
      let present;

      switch (action) {
        case 'analyze': {
          const calendar = parseCalendar(input.calendarData);
          const focusBlocks = Array.isArray(input.focusBlocks) ? input.focusBlocks : [];
          const timeRange = input.timeRange || '24 hours';

          const lines = [
            'Calendar & Focus Analysis',
            '=========================',
            '',
            'Time range: ' + timeRange,
            'Calendar entries analyzed: ' + calendar.length,
            'Focus blocks declared: ' + focusBlocks.length,
            '',
            'Calendar summary:',
          ];

          if (calendar.length > 0) {
            const meetings = calendar.filter(function(c) { return c.type === 'meeting' || c.title; });
            const conflicts = calendar.filter(function(c) { return c.conflict === true; });
            lines.push('  Total events: ' + calendar.length);
            lines.push('  Meetings/events with titles: ' + meetings.length);
            lines.push('  Detected conflicts: ' + conflicts.length);
            lines.push('');
            lines.push('Upcoming events:');
            calendar.slice(0, 15).forEach(function(c, i) {
              const label = c.title || c.name || ('Event ' + (i + 1));
              lines.push('  ' + (i + 1) + '. ' + label + ' (' + (c.start || 'unspecified') + ' - ' + (c.end || 'unspecified') + ')');
            });
          } else {
            lines.push('  No calendar data provided. Supply calendar data for analysis.');
          }

          lines.push('');
          lines.push('Focus block assessment:');
          if (focusBlocks.length > 0) {
            focusBlocks.forEach(function(b, i) { lines.push(formatFocusBlock(b, i)); });
          } else {
            lines.push('  No focus blocks declared. Define strategic focus blocks to protect.');
          }

          lines.push('');
          lines.push('Analysis recommendations:');
          lines.push('  1. Identify and mark high-value strategic work for protected focus');
          lines.push('  2. Reduce or batch recurring low-value meetings');
          lines.push('  3. Resolve detected conflicts in favor of strategic priorities');
          lines.push('  4. Delegate non-essential meetings to the chief of staff');
          lines.push('');
          lines.push('Note: This analysis is derived from supplied data. Confirm findings before action.');

          result = { action, timeRange, calendar, focusBlocks, ctx: { calendarEntries: calendar.length, focusBlockCount: focusBlocks.length } };
          present = [{ id: 'calendar-analysis', title: 'Calendar & Focus Analysis', kind: 'text', body: lines.join(NL) }];
          break;
        }

        case 'protect-focus': {
          const focusBlocks = Array.isArray(input.focusBlocks) ? input.focusBlocks : [];
          const proposedFocusBlocks = Array.isArray(input.proposedFocusBlocks) ? input.proposedFocusBlocks : focusBlocks;

          if (proposedFocusBlocks.length === 0) {
            return fail('not-connected', 'Not connected: no focus blocks or proposed focus blocks provided to protect', 'Input required');
          }

          const lines = [
            'Strategic Focus Protection Plan',
            '================================',
            '',
            'Focus blocks to protect: ' + proposedFocusBlocks.length,
            '',
            'Protection directives:',
          ];

          proposedFocusBlocks.forEach(function(b, i) {
            const title = b.title || b.name || 'Focus Block ' + (i + 1);
            const start = b.start || b.startTime || 'unspecified';
            const end = b.end || b.endTime || 'unspecified';
            lines.push('  ' + (i + 1) + '. BLOCK: ' + title + ' (' + start + ' - ' + end + ')');
            lines.push('     Action: Mark as protected / do-not-disturb');
            lines.push('     Meeting policy: Auto-decline or route to delegate');
            lines.push('     Buffer: ' + (b.bufferMinutes ? b.bufferMinutes + ' minutes before/after' : 'Standard buffer recommended'));
            lines.push('');
          });

          lines.push('Chief of staff contact: ' + (input.chiefOfStaffContact || 'not specified'));
          lines.push('');
          lines.push('Implementation steps:');
          lines.push('  1. Add protected blocks to calendar with visibility set to "busy"');
          lines.push('  2. Configure auto-decline with delegation notice for conflicting meetings');
          lines.push('  3. Notify direct reports of protected focus windows');
          lines.push('  4. Review and adjust blocks weekly based on strategic priority shifts');
          lines.push('');
          lines.push('Note: Protection is advisory. Apply to calendar only after executive confirmation.');

          result = { action, protectedBlocks: proposedFocusBlocks, chiefOfStaffContact: input.chiefOfStaffContact || '' };
          present = [{ id: 'focus-protection', title: 'Strategic Focus Protection Plan', kind: 'text', body: lines.join(NL) }];
          break;
        }

        case 'resolve-conflict': {
          const conflictId = input.conflictId || '';
          const meetingId = input.meetingId || '';
          const conflictResolutionRules = Array.isArray(input.conflictResolutionRules) ? input.conflictResolutionRules : ['Strategic work takes precedence', 'Recurring operational meetings move to delegate', 'New meetings require chief of staff screening'];
          const calendar = parseCalendar(input.calendarData);

          if (!conflictId && !meetingId) {
            return fail('not-connected', 'Not connected: provide conflictId or meetingId to resolve a conflict', 'Input required');
          }

          const lines = [
            'Conflict Resolution',
            '===================',
            '',
            'Conflict ID: ' + (conflictId || 'unspecified'),
            'Meeting ID: ' + (meetingId || 'unspecified'),
            '',
            'Resolution rules (applied):',
          ];

          conflictResolutionRules.forEach(function(r, i) { lines.push('  ' + (i + 1) + '. ' + String(r)); });

          lines.push('');
          lines.push('Resolution steps:');
          lines.push('  1. Identify the strategic priority at the core of this conflict');
          lines.push('  2. Apply resolution rule: highest-priority item is protected');
          lines.push('  3. Decline, defer, or delegate the lower-priority item');
          if (meetingId) lines.push('  4. Meeting ' + meetingId + ' is targeted for delegation or rescheduling');
          lines.push('  5. Confirm adjustment with executive before calendar commit');
          lines.push('');
          lines.push('Chief of staff contact: ' + (input.chiefOfStaffContact || 'not specified'));
          lines.push('');
          lines.push('Note: Conflict resolution is advisory. Calendar changes require explicit executive approval.');

          result = { action, conflictId, meetingId, conflictResolutionRules, calendar };
          present = [{ id: 'conflict-resolution', title: 'Conflict Resolution', kind: 'text', body: lines.join(NL) }];
          break;
        }

        case 'delegate': {
          const delegationRules = Array.isArray(input.delegationRules) ? input.delegationRules : ['Operational check-ins -> delegate', 'Vendor syncs -> delegate', 'Status updates -> delegate', 'Strategic planning -> retain'];
          const meetingId = input.meetingId || '';
          const calendar = parseCalendar(input.calendarData);

          const lines = [
            'Meeting Delegation Plan',
            '=======================',
            '',
            'Chief of staff contact: ' + (input.chiefOfStaffContact || 'not specified'),
            '',
            'Delegation rules:',
          ];

          delegationRules.forEach(function(r, i) { lines.push('  ' + (i + 1) + '. ' + String(r)); });

          lines.push('');
          lines.push('Delegation steps:');
          lines.push('  1. Apply delegation rules to each calendar meeting');
          if (meetingId) lines.push('  2. Meeting ' + meetingId + ' flagged for delegation to chief of staff');
          lines.push('  3. Chief of staff receives meeting context, agenda, and desired outcome');
          lines.push('  4. Executive retains ownership of strategic items; delegate owns operational items');
          lines.push('  5. Log delegation actions for follow-up tracking');
          lines.push('');
          lines.push('Meetings available for delegation: ' + calendar.length);
          lines.push('');
          lines.push('Note: Delegation assignments are advisory. Confirm with executive before re-assigning ownership.');

          result = { action, delegationRules, meetingId, chiefOfStaffContact: input.chiefOfStaffContact || '', calendar };
          present = [{ id: 'delegation-plan', title: 'Meeting Delegation Plan', kind: 'text', body: lines.join(NL) }];
          break;
        }

        case 'optimize': {
          const calendar = parseCalendar(input.calendarData);
          const focusBlocks = Array.isArray(input.focusBlocks) ? input.focusBlocks : [];
          const timeRange = input.timeRange || 'week';
          const delegationRules = Array.isArray(input.delegationRules) ? input.delegationRules : ['Operational check-ins -> delegate', 'Vendor syncs -> delegate', 'Status updates -> delegate'];

          const lines = [
            'Calendar Optimization Plan',
            '==========================',
            '',
            'Time range: ' + timeRange,
            'Calendar entries: ' + calendar.length,
            'Focus blocks: ' + focusBlocks.length,
            '',
            'Optimization phases:',
          ];

          lines.push('  Phase 1: Strategic focus protection');
          focusBlocks.forEach(function(b, i) { lines.push(formatFocusBlock(b, i)); });
          if (focusBlocks.length === 0) lines.push('  (No focus blocks declared - define strategic blocks first)');

          lines.push('');
          lines.push('  Phase 2: Meeting rationalization');
          lines.push('  Total meetings to review: ' + calendar.filter(function(c) { return c.type === 'meeting' || c.title; }).length);
          delegationRules.forEach(function(r, i) { lines.push('  Delegation rule ' + (i + 1) + ': ' + String(r)); });

          lines.push('');
          lines.push('  Phase 3: Conflict prevention');
          lines.push('  Conflict resolution rules applied: ' + (Array.isArray(input.conflictResolutionRules) ? input.conflictResolutionRules.length : 0));
          lines.push('  Chief of staff screening: enabled');

          lines.push('');
          lines.push('  Phase 4: Buffer and transition planning');
          lines.push('  Recommended: 15-min buffers before/after focus blocks');
          lines.push('  Recommended: No-meeting windows aligned to peak cognitive hours');

          lines.push('');
          lines.push('Optimization summary:');
          lines.push('  Focus blocks protected: ' + focusBlocks.length);
          lines.push('  Meetings eligible for delegation: ' + Math.max(0, calendar.length - focusBlocks.length));
          lines.push('  Estimated strategic time freed: ' + (focusBlocks.length * 1) + ' hours (based on block count)');
          lines.push('');
          lines.push('Chief of staff contact: ' + (input.chiefOfStaffContact || 'not specified'));
          lines.push('');
          lines.push('Note: Optimization is advisory. Apply changes only after executive confirmation.');

          result = { action, timeRange, calendar, focusBlocks, delegationRules, calendarEntries: calendar.length, focusBlockCount: focusBlocks.length };
          present = [{ id: 'calendar-optimization', title: 'Calendar Optimization Plan', kind: 'text', body: lines.join(NL) }];
          break;
        }

        default:
          return fail('error', 'Unknown action: ' + action, 'Invalid action');
      }

      store.push(result);
      ctx.store.save('time-strategic-focus', store);

      return { success: true, status: 'ok', data: result, error: null, present };
    }
  });
TIME_STRATEGIC_FOCUS_PROXY.configSchema = TIME_CONFIG;

TIME_STRATEGIC_FOCUS_PROXY.configSchema = TIME_CONFIG;
withUxMetadata(TIME_STRATEGIC_FOCUS_PROXY.inputSchema as SchemaRecord);
if (TIME_STRATEGIC_FOCUS_PROXY.configSchema) withUxMetadata(TIME_STRATEGIC_FOCUS_PROXY.configSchema);
