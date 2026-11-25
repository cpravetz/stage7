import { NARRATIVE_ARC_PACING_EVALUATOR } from '../src/assistants/scriptwriting/skills/narrative-arc-pacing-evaluator';
import { scriptwritingSkills } from '../src/assistants/scriptwriting';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';

/**
 * Runs a skill's generated sourceCode the way the tool-executor does: wraps it
 * with a `__tool_input` global and executes it in a Node child process, where
 * the handler's return value is surfaced through ctx.emit.success (console.log
 * of a JSON line). This is the exact path that turned a missing handler return
 * into "Execution completed with no output" at runtime.
 */
function runSkillSource(sourceCode: string, input: Record<string, unknown>): { emitted: unknown | null } {
  const wrapped = `const __tool_input = ${JSON.stringify(input)};\n${sourceCode}`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptwriting_test_'));
  const tmpFile = path.join(tmpDir, 'main.js');
  fs.writeFileSync(tmpFile, wrapped);
  try {
    const stdout = execSync(`node ${tmpFile}`, { encoding: 'utf8', timeout: 15000 });
    const trimmed = stdout.trim();
    return { emitted: trimmed ? JSON.parse(trimmed) : null };
  } catch (err: any) {
    // Non-zero exit is a real failure: surface it rather than swallowing it.
    // cause is attached imperatively: the tsconfig lib is ES2020, which lacks
    // the ErrorOptions constructor overload.
    const failure = new Error(`skill source exited non-zero: ${err.stderr || err.message}`) as Error & { cause?: unknown };
    failure.cause = err;
    throw failure;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

const SAMPLE_SCRIPT = [
  'INT. DINER - NIGHT',
  '',
  'ANNA',
  'We have to leave before it is over.',
  '',
  'MARCUS',
  'Then go through the back.',
  '',
  'EXT. STREET - CONTINUOUS',
  '',
  'They run. A siren calls. Anna stops dead.',
  '',
  'INT. WAREHOUSE - NIGHT',
  '',
  'MARCUS',
  'Now. It ends here.',
  '',
  'EXT. DOCKS - DAWN',
  '',
  'Anna signs the letter and drops it in the water.',
].join('\n');

describe('Scriptwriting — narrative-arc-pacing-evaluator output contract', () => {
  it('is registered in the assistant skill set', () => {
    expect(scriptwritingSkills.map((s) => s.id)).toContain('scriptwriting-narrative-arc-pacing-evaluator');
  });

  it('returns a structured error (not silence) when the script is blank', () => {
    const { emitted } = runSkillSource(NARRATIVE_ARC_PACING_EVALUATOR.manifest.sourceCode as string, {
      script: '',
      format: 'script',
      genre: 'drama',
    });

    // Regression: the empty guard fell through and the handler had no return,
    // so nothing was emitted at all and the run read as "completed with no output".
    expect(emitted).not.toBeNull();
    const result = emitted as { success: boolean; error: string | null; present: Array<{ id: string; body: string }> };
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no script/i);
    expect(Array.isArray(result.present)).toBe(true);
    expect(result.present.length).toBeGreaterThan(0);
    expect(result.present[0].body).toMatch(/script/i);
  });

  it('returns the evaluation payload on the success path', () => {
    const { emitted } = runSkillSource(NARRATIVE_ARC_PACING_EVALUATOR.manifest.sourceCode as string, {
      script: SAMPLE_SCRIPT,
      format: 'script',
      genre: 'thriller',
      audience: 'adult',
      pageTarget: 110,
    });

    // Regression: the handler computed and stored the evaluation but never
    // returned it, so even a valid script produced no output.
    expect(emitted).not.toBeNull();
    const result = emitted as {
      success: boolean;
      data: {
        pacing: { totalScenes: number };
        arc: Record<string, unknown>;
        scenes: unknown[];
        pacingFlags: unknown[];
      };
      present: Array<{ id: string; kind: string; body: string }>;
    };
    expect(result.success).toBe(true);
    expect(result.data.pacing.totalScenes).toBeGreaterThanOrEqual(3);
    expect(result.data.arc).toBeDefined();
    expect(result.data.scenes.length).toBeGreaterThan(0);
    expect(Array.isArray(result.data.pacingFlags)).toBe(true);
    expect(result.present).toHaveLength(1);
    expect(result.present[0].id).toBe('pacing-report');
    expect(result.present[0].kind).toBe('text');
    expect(result.present[0].body).toContain('STRUCTURE SCORE');
  });
});
