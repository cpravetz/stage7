import { ToolExecutor } from '../services/ToolExecutor';
import { Tool } from '../types';
import { validateAgainstOutputSchema } from '../utils/schemaValidator';
import { careResourceReferralCoordinator } from '../data/skills/healthcare/care-resource-referral-coordinator';

/**
 * `care-resource-referral-coordinator` had no test at all, and it mis-read its
 * own delegation result.
 *
 * All three of its callees are createExternalActionSkill tools, which emit
 * { success, system, action, request, response, error } and have NO top-level
 * `data` key -- the platform reply arrives at response.data. Reading only
 * `result.data` meant the summary reported the placeholder
 * { channel, sent: true } and the message that had actually been sent was
 * discarded. The neighbouring resource-coordination read already handled both
 * shapes; the communication read in the emitted summary did not.
 */
function codeTool(id: string, payload: unknown): Tool {
  return {
    id,
    name: id,
    description: `stand-in ${id}`,
    type: 'code',
    manifest: {
      language: 'javascript',
      entrypoint: 'index.js',
      sourceCode: `console.log(JSON.stringify(${JSON.stringify(payload)}));`,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    isSkill: false,
  };
}

/** Mirrors createExternalActionSkill's emitted envelope. */
function externalAction(responseData: unknown) {
  return {
    success: true,
    system: 'test_system',
    action: 'test_action',
    request: { input: {}, endpoint: 'https://example.invalid', method: 'POST', headers: {} },
    response: { status: 200, data: responseData },
    error: null,
  };
}

async function runSkill(tool: Tool, input: Record<string, unknown>, delegates: Tool[]) {
  const registry = new Map<string, Tool>();
  for (const d of delegates) registry.set(d.id, d);
  registry.set(tool.id, tool);
  const executor = new ToolExecutor(registry);
  const exec = await executor.execute(tool, input);
  const output = exec.output as { output?: string; outputSchemaIssues?: ReturnType<typeof validateAgainstOutputSchema> };
  let result: Record<string, unknown> = {};
  if (typeof output?.output === 'string') result = JSON.parse(output.output);
  return { result, schemaIssues: output?.outputSchemaIssues || [] };
}

describe('care-resource-referral-coordinator delegation payload', () => {
  it('reports the real communication reply rather than the placeholder', async () => {
    const { result } = await runSkill(
      careResourceReferralCoordinator as unknown as Tool,
      {
        patient: 'pat-1',
        clinicalNeeds: ['cardiology'],
        specialty: 'Cardiology',
        dryRun: true,
        communicationChannel: 'portal',
        communicationConfirmation: true,
        confirmation: true,
      },
      [
        codeTool('healthcare-records-scheduling-ops', { success: true, data: { recordId: 'rec-1' } }),
        codeTool('healthcare-resource-coordination', { success: true, data: { resourceId: 'res-1' } }),
        // The payload the coordinator was dropping on the floor.
        codeTool('healthcare-patient-communication', externalAction({ channel: 'sms', sent: true, messageId: 'msg-9' })),
      ],
    );

    const data = result.data as { communication?: { channel?: string; messageId?: string } } | null;
    // The reply lives at response.data. Reading only the top-level `data` key
    // made this the placeholder, and the sent message was never reported.
    expect(data?.communication?.channel).toBe('sms');
    expect(data?.communication?.messageId).toBe('msg-9');
  }, 20000);
});
