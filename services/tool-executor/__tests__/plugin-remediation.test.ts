import {
  remediationOptions,
  buildPluginTruncatedCompletionQuery,
  buildPluginContentRepairQuery,
  buildPluginSchemaRepairQuery,
  buildPluginRegistryRepairQuery,
  buildPluginTestFailureRepairQuery,
  buildContractRepairQuery,
  PLUGIN_JSON_SHAPE_JSON,
  CONTRACT_JSON_SHAPE_JSON,
} from '../src/services/PluginGenerator';

describe('focused remediation framework', () => {
  describe('remediationOptions', () => {
    it('uses balanced routing and the base temperature on the first attempt', () => {
      const opts = remediationOptions({ attempt: 1, routingSessionId: 's1', maxTokens: 8192, baseTemperature: 0.1 });
      expect(opts.optimizeFor).toBe('balanced');
      expect(opts.temperature).toBe(0.1);
      expect(opts.routingSessionId).toBe('s1');
      expect(opts.maxTokens).toBe(8192);
    });

    it('switches to accuracy routing, bumps temperature, and keeps the same session on retries', () => {
      const opts = remediationOptions({ attempt: 2, routingSessionId: 's1', maxTokens: 4096, baseTemperature: 0.2 });
      expect(opts.optimizeFor).toBe('accuracy');
      expect(opts.temperature).toBeGreaterThan(0.2);
      expect(opts.routingSessionId).toBe('s1');
    });

    it('does not reproduce the same temperature on retries (avoids identical output)', () => {
      const first = remediationOptions({ attempt: 1, routingSessionId: 's', maxTokens: 100, baseTemperature: 0.2 });
      const retry = remediationOptions({ attempt: 2, routingSessionId: 's', maxTokens: 100, baseTemperature: 0.2 });
      expect(retry.temperature).not.toBe(first.temperature);
    });

    it('caps the retry temperature', () => {
      const opts = remediationOptions({ attempt: 5, routingSessionId: 's', maxTokens: 100, baseTemperature: 0.6 });
      expect(opts.temperature).toBeLessThanOrEqual(0.7);
    });
  });

  describe('shape constants', () => {
    it('plugin shape is valid JSON', () => {
      expect(() => JSON.parse(PLUGIN_JSON_SHAPE_JSON)).not.toThrow();
      expect(JSON.parse(PLUGIN_JSON_SHAPE_JSON)).toHaveProperty('sourceCode');
    });

    it('contract shape is valid JSON with a cases array', () => {
      const parsed = JSON.parse(CONTRACT_JSON_SHAPE_JSON);
      expect(Array.isArray(parsed.cases)).toBe(true);
    });
  });

  describe('focused query builders', () => {
    it('truncated completion query carries the prefix and asks to continue', () => {
      const q = buildPluginTruncatedCompletionQuery('{"id":"x","sourceCode":"print(1)');
      expect(q).toContain('cut off');
      expect(q).toContain('{"id":"x","sourceCode":"print(1)');
      expect(q.toLowerCase()).toContain('continue');
    });

    it('content repair query names the reason and keeps capability + contract', () => {
      const q = buildPluginContentRepairQuery({
        description: 'send an SMS',
        testContract: { description: 'd', cases: [] },
        reason: 'response was prose only',
        previousContent: 'Sure, here you go!',
      });
      expect(q).toContain('send an SMS');
      expect(q).toContain('response was prose only');
      expect(q).toContain('Your previous response');
      expect(q).toContain('"cases"');
    });

    it('schema repair query includes the failing reason', () => {
      const q = buildPluginSchemaRepairQuery({ reason: 'plugin.sourceCode Required' });
      expect(q).toContain('plugin.sourceCode Required');
      expect(q).toContain('"sourceCode"');
    });

    it('registry repair query is narrow: only asks to change the id', () => {
      const q = buildPluginRegistryRepairQuery('sms_tool');
      expect(q).toContain('sms_tool');
      expect(q.toLowerCase()).toContain('new, unique');
      expect(q).not.toContain('Requirements:');
    });

    it('test-failure query includes the failing cases and current source', () => {
      const q = buildPluginTestFailureRepairQuery({
        description: 'add numbers',
        testContract: { description: 'd', cases: [] },
        sourceCode: 'print(__tool_input)',
        failedCases: ['adds: expected 3 got 0'],
      });
      expect(q).toContain('adds: expected 3 got 0');
      expect(q).toContain('print(__tool_input)');
      expect(q).toContain('Fix ONLY the code');
    });

    it('contract repair query names the defect and the capability', () => {
      const q = buildContractRepairQuery({
        description: 'send an SMS',
        requirements: ['use Twilio'],
        reason: 'contract.cases must be an array',
        previousContent: '{"description":"x"}',
      });
      expect(q).toContain('contract.cases must be an array');
      expect(q).toContain('send an SMS');
      expect(q).not.toContain('{"description":"x"}');
      expect(q).toContain('test data itself');
    });
  });
});