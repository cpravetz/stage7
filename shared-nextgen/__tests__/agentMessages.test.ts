import {
  isAgentConversationPayload,
  isInternalReasoning,
  isJsonPayload,
  sanitizeAgentMessage,
  stripInternalReasoning,
} from '../src/utils/agentMessages';

describe('agent message sanitization', () => {
  it('detects raw JSON payloads', () => {
    expect(isJsonPayload('{"id":"sms_sender"}')).toBe(true);
    expect(isJsonPayload('[{"toolId":"email_sender"}]')).toBe(true);
    expect(isJsonPayload('The message was sent.')).toBe(false);
  });

  it('suppresses manifests and other internal action payloads', () => {
    const manifest = JSON.stringify({
      id: 'sms_sender',
      name: 'SMS Sender',
      type: 'code',
      entrypoint: 'index.js',
      sourceCode: 'const input = __tool_input;',
    });

    expect(isAgentConversationPayload(manifest)).toBe(true);
    expect(sanitizeAgentMessage(manifest).suppressed).toBe(true);
    expect(sanitizeAgentMessage(manifest).text).not.toContain('sms_sender');
  });

  it('suppresses plans and structured review payloads', () => {
    expect(isAgentConversationPayload(JSON.stringify({
      summary: 'A mission plan',
      phases: [{ id: 'phase-1', name: 'Send', tasks: [] }],
    }))).toBe(true);
    expect(isAgentConversationPayload(JSON.stringify({ plan: { phases: [] } }))).toBe(true);
  });

  it('strips execution traces from readable text', () => {
    expect(stripInternalReasoning(
      'The send did not complete. Steps that ran: __list_tools, email_sender. The phase reviewer should use this blocker to regroup the task.',
    )).toBe('The send did not complete.');
    expect(isInternalReasoning('No matching authoritative action receipt was found.')).toBe(true);
    expect(sanitizeAgentMessage('The message was sent.')).toEqual({
      text: 'The message was sent.',
      suppressed: false,
    });
  });
});