import { extractFirstJsonObject, looksTruncated } from '../src/services/PluginGenerator';

describe('PluginGenerator JSON extraction', () => {
  it('parses a clean single JSON object', () => {
    const json = { description: 'd', cases: [{ name: 'c1', input: {}, expectedOutput: {} }] };
    expect(extractFirstJsonObject(JSON.stringify(json))).toEqual(json);
  });

  it('parses a JSON object wrapped in prose and markdown fences', () => {
    const json = { description: 'd', cases: [] };
    const content = `Here is the contract:\n\`\`\`json\n${JSON.stringify(json)}\n\`\`\`\nHope that helps.`;
    expect(extractFirstJsonObject(content)).toEqual(json);
  });

  it('returns undefined for prose with no JSON object', () => {
    expect(extractFirstJsonObject('I cannot help with that request.')).toBeUndefined();
  });

  it('returns undefined for an unterminated (truncated) object', () => {
    expect(extractFirstJsonObject('{"description":"d","cases":[{"name":"c1"}')).toBeUndefined();
  });

  it('looksTruncated is true for an unclosed object', () => {
    expect(looksTruncated('{"description":"d","cases":[{"name":"c1"}')).toBe(true);
  });

  it('looksTruncated is true for an unterminated string', () => {
    expect(looksTruncated('{"description":"d and more')).toBe(true);
  });

  it('looksTruncated is false for a complete object', () => {
    expect(looksTruncated('{"description":"d","cases":[]}')).toBe(false);
  });

  it('looksTruncated ignores braces inside strings', () => {
    expect(looksTruncated('{"description":"has } brace","cases":[]}')).toBe(false);
  });
});