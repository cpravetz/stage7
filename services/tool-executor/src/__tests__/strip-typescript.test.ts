import { ToolExecutor } from '../services/ToolExecutor';
import { createDeclarativeCodeSkill, stripTypeScript } from '../data/skills/code-skill-factory';

const CASES: Array<[string, string, string]> = [
  ['param annotation', 'async function handler(input: any, ctx: any) { return 1; }', 'async function handler(input, ctx) { return 1; }'],
  ['param default + union', 'function f(a: string = "x", b: number | null = null) { return a; }', 'function f(a = "x", b = null) { return a; }'],
  ['optional param', 'function f(a?: string) { return a; }', 'function f(a) { return a; }'],
  ['const annotation', 'function f() { const x: number = 1; return x; }', 'function f() { const x = 1; return x; }'],
  ['let annotation', 'function f() { let y: any = null; return y; }', 'function f() { let y = null; return y; }'],
  ['array-of annotation', 'function f() { const z: string[] = []; return z; }', 'function f() { const z = []; return z; }'],
  ['generic annotation', 'function f() { const m: Record<string, any> = {}; return m; }', 'function f() { const m = {}; return m; }'],
  ['return type void', 'function foo(): void { return; }', 'function foo() { return; }'],
  ['return type promise', 'async function foo(): Promise<void> { return; }', 'async function foo() { return; }'],
  ['return type arrow', 'const f = async (input: any): Promise<any> => { return 1; };', 'const f = async (input) => { return 1; };'],
  ['as any', 'function f(e: any) { const x = e as any; return x; }', 'function f(e) { const x = e; return x; }'],
  ['as Record', 'function f(e: any) { const x = e as Record<string, any>; return x; }', 'function f(e) { const x = e; return x; }'],
  ['cast parens', 'function f() { try { g(); } catch (error) { return (error as any); } }', 'function f() { try { g(); } catch (error) { return (error); } }'],
  ['as union', 'function f(x: any) { const y = x as string | number; return y; }', 'function f(x) { const y = x; return y; }'],
  ['as const', 'function f() { const a = [1,2] as const; return a; }', 'function f() { const a = [1,2]; return a; }'],
  ['non-null', 'function f(x?: any) { return x!.length; }', 'function f(x) { return x.length; }'],
  ['Array<any> -> Array', 'function f() { const a: Array<any> = []; return a; }', 'function f() { const a = []; return a; }'],
  ['any[] stays', 'function f() { const a: any[] = []; return a; }', 'function f() { const a = []; return a; }'],
  ['catch annotation', 'function f() { try { g(); } catch (error: unknown) { return 1; } return 2; }', 'function f() { try { g(); } catch (error) { return 1; } return 2; }'],
  ['for-loop annotation', 'function f(n: number) { let t = 0; for (let i: number = 0; i < n; i++) { t += i; } return t; }', 'function f(n) { let t = 0; for (let i = 0; i < n; i++) { t += i; } return t; }'],
  ['destructured param', 'function f({ a, b }: { a: number; b: number }) { return a + b; }', 'function f({ a, b }) { return a + b; }'],
  ['destructured const', 'function f() { const { a }: Config = cfg; return a; }', 'function f() { const { a } = cfg; return a; }'],
  ['nested arrow types', 'function f(rows: any[]) { return rows.map(function (r: any) { return r.id as string; }); }', 'function f(rows) { return rows.map(function (r) { return r.id; }); }'],
  ['nested arrow typed body', 'function f(rows: any[]) { return rows.filter(function (r: any) { return r.ok; }); }', 'function f(rows) { return rows.filter(function (r) { return r.ok; }); }'],
  ['generic call args', 'function f(xs: any[]) { return xs.filter(function (x: any) { return x > 1; }); }', 'function f(xs) { return xs.filter(function (x) { return x > 1; }); }'],

  // Things that must NOT be touched.
  ['ternary in params', 'function f(a: any, b: any) { const v = a ? b : a; return v; }', 'function f(a, b) { const v = a ? b : a; return v; }'],
  ['object literal colon', 'function f() { return { a: 1, b: "x" }; }', 'function f() { return { a: 1, b: "x" }; }'],
  ['switch case colon', 'function f(x: any) { switch (x) { case 1: return "a"; default: return "b"; } }', 'function f(x) { switch (x) { case 1: return "a"; default: return "b"; } }'],
  ['label colon', 'function f() { outer: for (;;) { break outer; } return 1; }', 'function f() { outer: for (;;) { break outer; } return 1; }'],
  ['string with type-like text', 'function f() { return "const x: number = 1; y as any"; }', 'function f() { return "const x: number = 1; y as any"; }'],
  ['template with type-like text', 'function f() { return `value as any and : colon`; }', 'function f() { return `value as any and : colon`; }'],
  ['regex untouched', 'function f() { return "a:b".replace(/a:b/, "x"); }', 'function f() { return "a:b".replace(/a:b/, "x"); }'],
  ['division not regex', 'function f(a: any, b: any) { return (a / b) as number; }', 'function f(a, b) { return (a / b); }'],
  ['if condition colon-ish', 'function f(x: any) { if (x) { return 1; } return 2; }', 'function f(x) { if (x) { return 1; } return 2; }'],
  ['method shorthand', 'const o = { async handler(input: any, ctx: any) { return input; } };', 'const o = { async handler(input, ctx) { return input; } };'],
  ['if statement ternary', 'function f(a: any, b: any) { if (a) { return b ? 1 : 2; } return 3; }', 'function f(a, b) { if (a) { return b ? 1 : 2; } return 3; }'],
  ['interface-ish object in call', 'function f() { return g({ type: "x", id: 1 }); }', 'function f() { return g({ type: "x", id: 1 }); }'],
  ['promise constructor', 'function f() { return new Promise(function (r) { r(1); }); }', 'function f() { return new Promise(function (r) { r(1); }); }'],
  ['plain JS untouched', 'function f(a, b) { return a + b; }', 'function f(a, b) { return a + b; }'],
];

describe('stripTypeScript', () => {
  for (const [name, input, expected] of CASES) {
    it(name, () => {
      const actual = stripTypeScript(input);
      expect(actual).toBe(expected);
      // And the result must be parseable as plain JavaScript.
      expect(() => new Function(actual.replace(/\bexport\b/g, ''))).not.toThrow();
    });
  }

  it('handles a real generated wrapper round trip', async () => {
    const handler = async function handler(input: any, ctx: any) {
      const rows: any[] = Array.isArray(input.rows) ? input.rows : [];
      let count: number = 0;
      for (const row of rows) {
        if (!row) continue;
        count += 1;
      }
      const label = 'rows: ' + count + ' ok as any';
      return { success: true, data: { label: label, count: count as number }, present: ctx.render.text('r', 'R', label) };
    };
    const stripped = stripTypeScript(handler.toString().trim());
    expect(stripped).not.toMatch(/:\s*(any|number|string|boolean)\b/);
    expect(stripped).not.toMatch(/\bas\s+(any|number|Record)\s*[;),}]/);
    expect(() => new Function(stripped)).not.toThrow();
    const fn = new Function(stripped + '; return handler;')();
    const ctx = { render: { text: (id: string, title: string, body: string) => ({ id, title, kind: 'text', body }) } };
    const out = await fn({ rows: [{}, {}, null] }, ctx);
    expect(out.data.count).toBe(2);
    expect(out.data.label).toBe('rows: 2 ok as any');
  });
});

describe('createDeclarativeCodeSkill with a fully typed handler', () => {
  it('runs in the executor and emits parseable JSON', async () => {
    const skill = createDeclarativeCodeSkill({
      id: 'typed-probe',
      name: 'Typed Probe',
      description: 'probe',
      inputSchema: { type: 'object', properties: {} },
      outputSchema: { type: 'object', properties: {} },
      handler: async function handler(input: any, ctx: any): Promise<any> {
        const rows: any[] = Array.isArray(input.rows) ? input.rows : [];
        let count: number = 0;
        const seen: Record<string, any> = {};
        for (const row of rows) {
          if (!row) continue;
          count += 1;
          seen[String(row.id)] = (seen[String(row.id)] as number) || 0;
        }
        const note = 'rows as supplied: ' + count;
        const first = rows[0]!.id as string;
        return {
          success: true,
          data: { count: count as number, note: note, first: first, keys: Object.keys(seen) },
          present: ctx.render.text('r', 'Rows', note),
        };
      },
    });

    const registry = new Map([[skill.id, skill]]);
    const out: any = await new ToolExecutor(registry).execute(skill, {
      rows: [{ id: 'a' }, { id: 'b' }, null],
    });
    const parsed = JSON.parse(out.output.output);
    expect(parsed.success).toBe(true);
    expect(parsed.data.count).toBe(2);
    expect(parsed.data.note).toBe('rows as supplied: 2');
    expect(parsed.data.first).toBe('a');
    expect(parsed.data.keys).toEqual(['a', 'b']);
  }, 30000);
});
