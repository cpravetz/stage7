import { extractJsonObject } from '../adk/resilience';

describe('extractJsonObject', () => {
  it('parses a bare JSON object', () => {
    expect(extractJsonObject('{"a": 1, "b": "two"}')).toEqual({ a: 1, b: 'two' });
  });

  it('parses an object embedded in prose before and after', () => {
    const text = 'Sure! Here is the result: {"result": 42} hope that helps.';
    expect(extractJsonObject(text)).toEqual({ result: 42 });
  });

  it('handles the multiple-object case the greedy regex mangled', () => {
    // /{[\s\S]*}/ grabs from the first { to the last }, producing invalid
    // JSON; the shared helper must return the first complete object.
    const text = 'First: {"a":1} and then also {"b":2} — pick the first.';
    expect(extractJsonObject(text)).toEqual({ a: 1 });
  });

  it('skips an invalid group and finds the next valid object', () => {
    const text = 'Junk {"not json" } follows. Real payload: {"good": true}';
    expect(extractJsonObject(text)).toEqual({ good: true });
  });

  it('preserves braces inside string values', () => {
    const text = '{"code": "function () { return {x: 1}; }", "lang": "js"}';
    expect(extractJsonObject(text)).toEqual({ code: 'function () { return {x: 1}; }', lang: 'js' });
  });

  it('preserves escaped quotes inside string values', () => {
    const text = '{"quote": "she said \\"hi\\"", "ok": true}';
    expect(extractJsonObject(text)).toEqual({ quote: 'she said "hi"', ok: true });
  });

  it('returns the outermost object for nested input', () => {
    const text = '{"outer": {"inner": [1, 2]}, "n": null}';
    expect(extractJsonObject(text)).toEqual({ outer: { inner: [1, 2] }, n: null });
  });

  it('extracts from a fenced code block', () => {
    const text = '```json\n{"sourceCode": "console.log(1)"}\n```';
    expect(extractJsonObject(text)).toEqual({ sourceCode: 'console.log(1)' });
  });

  it('extracts the healing payload after surrounding narration', () => {
    const text = '<analysis>The bug is on line 3.</analysis>\n{"sourceCode": "fixed()", "explanation": "off by one"}';
    expect(extractJsonObject(text)).toEqual({ sourceCode: 'fixed()', explanation: 'off by one' });
  });

  it('recovers when prose contains an unbalanced brace before the payload', () => {
    const text = 'Use the {placeholder} syntax. Actually: {"a": 1}';
    expect(extractJsonObject(text)).toEqual({ a: 1 });
  });

  it('recovers when an unclosed brace precedes a valid object', () => {
    const text = '{unclosed oops\n{"a": 1}';
    expect(extractJsonObject(text)).toEqual({ a: 1 });
  });

  it('returns the first object of a bare JSON array-of-objects text', () => {
    // Documented behavior: the helper scans for object groups, so an array
    // literal yields its first element rather than the array itself.
    expect(extractJsonObject('[{"a":1},{"b":2}]')).toEqual({ a: 1 });
  });

  it('returns null for non-object JSON scalars', () => {
    expect(extractJsonObject('null')).toBeNull();
    expect(extractJsonObject('42')).toBeNull();
    expect(extractJsonObject('"just a string"')).toBeNull();
  });

  it('returns null when there is no parseable object', () => {
    expect(extractJsonObject('no braces here at all')).toBeNull();
    expect(extractJsonObject('{ unclosed never finishes')).toBeNull();
    expect(extractJsonObject('{not json}')).toBeNull();
    expect(extractJsonObject('')).toBeNull();
  });
});
