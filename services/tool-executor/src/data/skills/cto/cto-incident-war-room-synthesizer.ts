// @ts-nocheck
import { SchemaProps, createDeclarativeCodeSkill, createSchemaRecord } from '../code-skill-factory';
import { INCIDENT_WAR_ROOM_TRIGGERS } from './cto-contract';

export const CTO_INCIDENT_WAR_ROOM_SYNTHESIZER = createDeclarativeCodeSkill({
    id: 'cto-incident-war-room-synthesizer',
    name: 'Incident War Room Synthesizer',
    description: 'Correlate supplied telemetry, logs, alerts, and deployment signals into hypotheses and mitigation steps.',
    persistenceEnvVar: 'CTO_HOME',
    inputSchema: createSchemaRecord({
      signals: SchemaProps.objectArray(SchemaProps.object({
        source: SchemaProps.text({ description: 'Telemetry, log, alert, or deployment source' }),
        evidence: SchemaProps.text({ description: 'Observed evidence' }),
        hypothesis: SchemaProps.text({ description: 'Optional root-cause hypothesis' }),
        confidence: SchemaProps.number({ description: 'Confidence from 0 to 1' }),
      }), { description: 'Incident signals to correlate' }),
      context: SchemaProps.object({}, { description: 'Additional incident context', additionalProperties: true }),
    }, { required: ['signals'] }),
    outputSchema: createSchemaRecord({
      success: SchemaProps.boolean({ description: 'Whether synthesis completed' }),
      data: SchemaProps.object({}, { description: 'Hypotheses and mitigations' }),
      error: SchemaProps.text({ description: 'Failure message' }),
      present: SchemaProps.objectArray(SchemaProps.object({
        id: SchemaProps.text({}),
        title: SchemaProps.text({}),
        kind: SchemaProps.text({}),
        body: SchemaProps.text({}),
      }), { description: 'Pre-formatted user-facing output blocks' }),
    }),
    triggers: INCIDENT_WAR_ROOM_TRIGGERS,
    tier: 'aid',
    domainKnowledge: 'Incident correlation techniques, signal triage, hypothesis formation, and mitigation sequencing',
    manifest: {
      ui: { view: 'incident-timeline' }
    },
    handler: async function handler(input, ctx) {
        const signals = Array.isArray(input.signals) ? input.signals : [];
        if (!signals.length) {
          const result = { success: false, error: 'Not connected: no telemetry, log, alert, or deployment signals were supplied', data: {} };

          return result;
        }
        const readinessResults = [];
        const errors = [];
        for (const signal of signals) {
          try {
            const result = await ctx.delegate('cto-incident-disaster-readiness', {
              provider: 'disaster-recovery',
              config: { signal, context: input.context || {} },
            });
            if (result && result.success === false) {
              errors.push({ source: signal.source || 'unknown', error: result.error || 'Underlying tool returned failure' });
            }
            readinessResults.push(result);
          } catch (e) {
            errors.push({ source: signal.source || 'unknown', error: e instanceof Error ? e.message : String(e) });
          }
        }
        const hypotheses = signals.map((signal) => ({
          source: signal.source,
          evidence: signal.evidence,
          hypothesis: signal.hypothesis || 'Correlate with the nearest deployment or dependency change',
          confidence: Number(signal.confidence || 0),
        }));
        const mitigations = hypotheses.slice(0, 3).map((item, index) => ({
          priority: index + 1,
          action: item.confidence > 0.7 ? 'rollback or isolate the suspected change' : 'collect additional telemetry before changing production',
          owner: 'incident commander',
        }));
        const stakeholderUpdate = 'Incident review in progress; production changes require explicit approval.';
        const result = { success: true, data: { hypotheses, mitigations, stakeholderUpdate, readinessResults, generatedAt: new Date().toISOString() }, error: errors.length ? errors : null };
        const reportLines = [
          'Incident War Room Synthesis',
          'Signals Analyzed: ' + signals.length,
          'Hypotheses Generated: ' + hypotheses.length,
          'Mitigations Proposed: ' + mitigations.length,
          '',
          'Hypotheses:',
        ];
        hypotheses.forEach((h, i) => {
          reportLines.push('  ' + (i + 1) + '. [' + (h.confidence * 100).toFixed(0) + '%] ' + h.source + ': ' + h.hypothesis + ' — Evidence: ' + h.evidence);
        });
        reportLines.push('', 'Mitigations:');
        mitigations.forEach((m) => {
          reportLines.push('  ' + m.priority + '. ' + m.action + ' (Owner: ' + m.owner + ')');
        });
        reportLines.push('', 'Stakeholder Update: ' + stakeholderUpdate);
        if (errors.length) {
          reportLines.push('', 'Errors from disaster readiness checks:');
          errors.forEach((e, i) => {
            reportLines.push('  ' + (i + 1) + '. ' + e.source + ': ' + e.error);
          });
        }

        return result;
      }
    });
