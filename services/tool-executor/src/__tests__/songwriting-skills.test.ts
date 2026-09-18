import { songwritingSkills } from '../data/skills/songwriting';
import { Tool } from '../types';
import * as songwritingModule from '../data/skills/songwriting';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

function executeSkillSource(source: string, input: Record<string, unknown>): { stdout: string; stderr: string } {
  const wrapped = `const __tool_input = ${JSON.stringify(input || {})};\n${source}`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'songwriting_test_'));
  const tmpFile = path.join(tmpDir, 'main.js');
  fs.writeFileSync(tmpFile, wrapped);
  try {
    const stdout = execSync(`node ${tmpFile}`, {
      env: { ...process.env, SONGWRITING_HOME: tmpDir },
      encoding: 'utf8',
      timeout: 10000,
    });
    return { stdout, stderr: '' };
  } catch (err: any) {
    return { stdout: err.stdout || '', stderr: err.stderr || '' };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

describe('Songwriter Creative — Batch A', () => {
  const skillsByName: Record<string, Tool> = songwritingSkills.reduce((acc, s) => {
    acc[s.name] = s;
    return acc;
  }, {} as Record<string, Tool>);

  describe('skill set reconciliation', () => {
    it('exports exactly three skills', () => {
      expect(songwritingSkills).toHaveLength(3);
    });

    it('reconciles the Advise higher-order skill', () => {
      expect(skillsByName['Advise Lyric & Structural Prosody Evaluator']).toBeDefined();
      const skill = skillsByName['Advise Lyric & Structural Prosody Evaluator'];
      expect(skill.id).toBe('songwriting_lyric_prosody_evaluator');
      expect(skill.type).toBe('code');
    });

    it('reconciles the Aid higher-order skill', () => {
      expect(skillsByName['Aid Musical & Lyric Co-Creation Engine']).toBeDefined();
      const skill = skillsByName['Aid Musical & Lyric Co-Creation Engine'];
      expect(skill.id).toBe('songwriting_musical_lyric_cocreation');
      expect(skill.type).toBe('code');
    });

    it('reconciles the Represent higher-order skill', () => {
      expect(skillsByName['Represent Lead Sheet & Demo Asset Dispatcher']).toBeDefined();
      const skill = skillsByName['Represent Lead Sheet & Demo Asset Dispatcher'];
      expect(skill.id).toBe('songwriting_lead_sheet_demo_dispatcher');
      expect(skill.type).toBe('code');
      expect(skill.confirmBeforeSend).toBe(true);
    });
  });

  describe('shared structure', () => {
    it('every skill has a stable id, name, description, and manifest with sourceCode', () => {
      for (const skill of songwritingSkills) {
        expect(typeof skill.id).toBe('string');
        expect(skill.id.length).toBeGreaterThan(0);
        expect(typeof skill.name).toBe('string');
        expect(skill.name.length).toBeGreaterThan(0);
        expect(typeof skill.description).toBe('string');
        expect(skill.description.length).toBeGreaterThan(0);
        expect(skill.type).toBe('code');
        const source = skill.manifest.sourceCode as string;
        expect(typeof source).toBe('string');
        expect(source.length).toBeGreaterThan(100);
        expect(skill.createdAt).toBeInstanceOf(Date);
        expect(skill.updatedAt).toBeInstanceOf(Date);
      }
    });

    it('every skill has non-empty inputSchema and outputSchema', () => {
      for (const skill of songwritingSkills) {
        expect(skill.inputSchema).toBeDefined();
        expect(typeof skill.inputSchema?.properties).toBe('object');
        expect(Object.keys(skill.inputSchema!.properties!).length).toBeGreaterThan(0);
        expect(skill.outputSchema).toBeDefined();
        expect(typeof skill.outputSchema?.properties).toBe('object');
      }
    });

    it('every inputSchema property has a description', () => {
      for (const skill of songwritingSkills) {
        const props = skill.inputSchema!.properties!;
        for (const key of Object.keys(props)) {
          const typedProp = props[key] as Record<string, unknown>;
          expect(typedProp.description).toBeTruthy();
          expect(typeof typedProp.description).toBe('string');
          expect((typedProp.description as string).length).toBeGreaterThan(0);
        }
      }
    });

    it('every outputSchema property has a description', () => {
      for (const skill of songwritingSkills) {
        const props = skill.outputSchema!.properties!;
        for (const key of Object.keys(props)) {
          const typedProp = props[key] as Record<string, unknown>;
          expect(typedProp.description).toBeTruthy();
        }
      }
    });
  });

  describe('user-prompt triggers', () => {
    it('every skill has at least one user-prompt trigger', () => {
      for (const skill of songwritingSkills) {
        const userTriggers = (skill.triggers || []).filter((t) => t.kind === 'user');
        expect(userTriggers.length).toBeGreaterThanOrEqual(1);
        for (const t of userTriggers) {
          expect(t.kind).toBe('user');
          expect(Array.isArray((t as { phrase_examples: string[] }).phrase_examples)).toBe(true);
          expect((t as { phrase_examples: string[] }).phrase_examples.length).toBeGreaterThan(0);
        }
      }
    });

    it('every skill has event and data triggers for reactive behavior', () => {
      for (const skill of songwritingSkills) {
        const kinds = (skill.triggers || []).map((t) => t.kind);
        expect(kinds).toContain('event');
        expect(kinds).toContain('data');
      }
    });
  });

  describe('SONGWRITING_HOME persistence', () => {
    it('all three source codes reference SONGWRITING_HOME', () => {
      for (const skill of songwritingSkills) {
        const source = skill.manifest.sourceCode as string;
        expect(source).toContain('SONGWRITING_HOME');
      }
    });

    it('evaluator source persists to lyric-evaluations.json', () => {
      const skill = skillsByName['Advise Lyric & Structural Prosody Evaluator'];
      expect(skill.manifest.sourceCode).toContain('lyric-evaluations.json');
    });

    it('co-creation source persists to drafts.json', () => {
      const skill = skillsByName['Aid Musical & Lyric Co-Creation Engine'];
      expect(skill.manifest.sourceCode).toContain('drafts.json');
    });

    it('dispatcher source persists to lead-sheets.json and registration-records.json', () => {
      const skill = skillsByName['Represent Lead Sheet & Demo Asset Dispatcher'];
      expect(skill.manifest.sourceCode).toContain('lead-sheets.json');
      expect(skill.manifest.sourceCode).toContain('registration-records.json');
    });
  });

  describe('dry-run and confirmation-gated dispatcher', () => {
    const dispatcher = skillsByName['Represent Lead Sheet & Demo Asset Dispatcher'];

    it('has confirmBeforeSend set at tool and manifest level', () => {
      expect(dispatcher.confirmBeforeSend).toBe(true);
      expect(dispatcher.manifest.confirmBeforeSend).toBe(true);
    });

    it('has a configSchema in the manifest', () => {
      expect(dispatcher.manifest.configSchema).toBeDefined();
      const configProps = (dispatcher.manifest.configSchema as Record<string, unknown>).properties as Record<string, unknown>;
      expect(configProps).toBeDefined();
      expect(configProps.endpointUrl).toBeDefined();
      expect(configProps.apiKey).toBeDefined();
      expect(configProps.provider).toBeDefined();
      expect(configProps.defaultFormat).toBeDefined();
      expect(configProps.confirmBeforeSend).toBeDefined();
    });

    it('has an endpointEnvVar in the manifest', () => {
      expect(dispatcher.manifest.endpointEnvVar).toBe('SONGWRITING_DISPATCH_ENDPOINT');
    });

    it('source code defaults to dry-run mode', () => {
      const source = dispatcher.manifest.sourceCode as string;
      expect(source).toContain("mode: 'dry-run'");
      expect(source).toContain("connected: false");
    });

    it('source code gates live dispatch behind dryRun === false and confirmation', () => {
      const source = dispatcher.manifest.sourceCode as string;
      expect(source).toContain("input.dryRun === false");
      expect(source).toContain("input.confirmed === true");
      expect(source).toContain("input.confirmation === true");
    });

    it('source code reports honest not-connected behavior without an endpoint', () => {
      const source = dispatcher.manifest.sourceCode as string;
      expect(source).toContain('Not connected: no asset endpoint is configured');
    });

    it('inputSchema has dryRun and confirmation fields', () => {
      const props = dispatcher.inputSchema!.properties!;
      expect(props.dryRun).toBeDefined();
      expect(props.confirmation).toBeDefined();
      expect((props.dryRun as { type: string }).type).toBe('boolean');
      expect((props.confirmation as { type: string }).type).toBe('boolean');
    });
  });

  describe('no stubs or mocked success in source code', () => {
    it('evaluator source contains syllable counting and stress analysis logic', () => {
      const skill = skillsByName['Advise Lyric & Structural Prosody Evaluator'];
      const source = skill.manifest.sourceCode as string;
      expect(source).toContain('estimateSyllables');
      expect(source).toContain('stressPattern');
      expect(source).toContain('rhymePairs');
      expect(source).toContain('meterVariance');
      expect(source).toContain('recommendations');
    });

    it('co-creation source contains chord progression and section generation logic', () => {
      const skill = skillsByName['Aid Musical & Lyric Co-Creation Engine'];
      const source = skill.manifest.sourceCode as string;
      expect(source).toContain('chordSets');
      expect(source).toContain('progression');
      expect(source).toContain('sectionNames');
      expect(source).toContain('sections');
      expect(source).toContain('beatSheet');
    });

    it('dispatcher source contains actual fetch logic for live dispatch', () => {
      const skill = skillsByName['Represent Lead Sheet & Demo Asset Dispatcher'];
      const source = skill.manifest.sourceCode as string;
      expect(source).toContain('fetch(endpoint');
      expect(source).toContain('JSON.stringify(artifact)');
      expect(source).toContain('response.status');
    });
  });

  describe('factory pattern usage', () => {
    it('evaluator and co-creation use createCodeSkill with javascript entrypoint', () => {
      const evaluator = skillsByName['Advise Lyric & Structural Prosody Evaluator'];
      const cocreation = skillsByName['Aid Musical & Lyric Co-Creation Engine'];
      expect(evaluator.manifest.language).toBe('javascript');
      expect(evaluator.manifest.entrypoint).toBe('index.js');
      expect(cocreation.manifest.language).toBe('javascript');
      expect(cocreation.manifest.entrypoint).toBe('index.js');
    });

    it('dispatcher uses createCodeSkill with withConfirmation wrapper', () => {
      const dispatcher = skillsByName['Represent Lead Sheet & Demo Asset Dispatcher'];
      expect(dispatcher.manifest.language).toBe('javascript');
      expect(dispatcher.manifest.entrypoint).toBe('index.js');
      expect(dispatcher.confirmBeforeSend).toBe(true);
    });
  });

  describe('module exports', () => {
    it('exports only songwritingSkills (no individual skill bindings)', () => {
      const exportedKeys = Object.keys(songwritingModule);
      expect(exportedKeys).toEqual(expect.arrayContaining(['songwritingSkills']));
      expect(exportedKeys).not.toContain('LYRIC_PROSODY_EVALUATOR');
      expect(exportedKeys).not.toContain('MUSICAL_LYRIC_COCREATION');
      expect(exportedKeys).not.toContain('LEAD_SHEET_DEMO_DISPATCHER');
    });
  });

  describe('UX metadata on schemas', () => {
    it('configSchema properties carry title, order, and hint', () => {
      const dispatcher = skillsByName['Represent Lead Sheet & Demo Asset Dispatcher'];
      const configProps = (dispatcher.manifest.configSchema as Record<string, unknown>).properties as Record<string, Record<string, unknown>>;
      for (const prop of Object.values(configProps)) {
        expect(prop.title).toBeTruthy();
        expect(typeof prop.order).toBe('number');
        expect(prop.hint).toBeTruthy();
      }
    });

    it('inputSchema properties carry title, order, and hint', () => {
      for (const skill of songwritingSkills) {
        const props = skill.inputSchema!.properties!;
        for (const [key, prop] of Object.entries(props)) {
          const typedProp = prop as Record<string, unknown>;
          expect(typedProp.title).toBeTruthy();
          expect(typedProp.order).not.toBeUndefined();
          expect(typedProp.hint).toBeTruthy();
        }
      }
    });
  });

  describe('source code execution', () => {
    const evaluator = skillsByName['Advise Lyric & Structural Prosody Evaluator'];
    const cocreation = skillsByName['Aid Musical & Lyric Co-Creation Engine'];
    const dispatcher = skillsByName['Represent Lead Sheet & Demo Asset Dispatcher'];

    it('evaluator validates required lyrics input', () => {
      const { stdout } = executeSkillSource(evaluator.manifest.sourceCode as string, { lyrics: '' });
      const parsed = JSON.parse(stdout.trim());
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('lyrics is required');
    });

    it('evaluator produces real prosody analysis from lyrics', () => {
      const lyrics = 'I love you forever\nAnd always till the end\nYou are my heart\ndefine my life to the end';
      const { stdout } = executeSkillSource(evaluator.manifest.sourceCode as string, { lyrics, genre: 'pop', structure: 'verse-chorus', targetMeter: 8 });
      const parsed = JSON.parse(stdout.trim());
      expect(parsed.success).toBe(true);
      expect(parsed.data.evaluation).toBeDefined();
      expect(parsed.data.evaluation.lineCount).toBe(4);
      expect(parsed.data.evaluation.averageSyllablesPerLine).toBeGreaterThan(0);
      expect(Array.isArray(parsed.data.evaluation.recommendations)).toBe(true);
      expect(parsed.data.evaluation.source).toBe('local');
      expect(parsed.data.storePath).toContain('songwriting');
    });

    it('evaluator detects missing required lyrics and rejects', () => {
      const { stdout } = executeSkillSource(evaluator.manifest.sourceCode as string, {});
      const parsed = JSON.parse(stdout.trim());
      expect(parsed.success).toBe(false);
    });

    it('co-creation engine requires a theme', () => {
      const { stdout } = executeSkillSource(cocreation.manifest.sourceCode as string, {});
      const parsed = JSON.parse(stdout.trim());
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('theme is required');
    });

    it('co-creation engine generates a deterministic song draft from a theme', () => {
      const { stdout } = executeSkillSource(cocreation.manifest.sourceCode as string, {
        theme: 'love',
        genre: 'pop',
        mood: 'hopeful',
        structure: 'verse-chorus',
        sectionCount: 4,
        seed: 42,
      });
      const parsed = JSON.parse(stdout.trim());
      expect(parsed.success).toBe(true);
      expect(parsed.data.draft).toBeDefined();
      expect(parsed.data.draft.theme).toBe('love');
      expect(parsed.data.draft.genre).toBe('pop');
      expect(parsed.data.draft.mood).toBe('hopeful');
      expect(parsed.data.draft.structure).toBe('verse-chorus');
      expect(Array.isArray(parsed.data.draft.sections)).toBe(true);
      expect(parsed.data.draft.sections.length).toBe(4);
      expect(parsed.data.draft.sections[0]).toHaveProperty('section');
      expect(parsed.data.draft.sections[0]).toHaveProperty('chord');
      expect(parsed.data.draft.sections[0]).toHaveProperty('lines');
      expect(parsed.data.draft.sections[0]).toHaveProperty('purpose');
      expect(parsed.data.draft.sections[0]).toHaveProperty('transition');
      expect(parsed.data.draft.chordProgression).toEqual(['I', 'V', 'vi', 'IV']);
      expect(parsed.data.draft.beatSheet).toBeDefined();
      expect(parsed.data.draft.source).toBe('local');
      expect(parsed.data.storePath).toContain('songwriting');
    });

    it('co-creation engine is deterministic for the same seed', () => {
      const input1 = { theme: 'love', genre: 'pop', mood: 'hopeful', seed: 99, save: false };
      const input2 = { theme: 'love', genre: 'pop', mood: 'hopeful', seed: 99, save: false };
      const { stdout: out1 } = executeSkillSource(cocreation.manifest.sourceCode as string, input1);
      const { stdout: out2 } = executeSkillSource(cocreation.manifest.sourceCode as string, input2);
      const draft1 = JSON.parse(out1.trim()).data.draft;
      const draft2 = JSON.parse(out2.trim()).data.draft;
      expect(draft1.sections[0].lines[0]).toBe(draft2.sections[0].lines[0]);
      expect(draft1.sections[0].chord).toBe(draft2.sections[0].chord);
    });

    it('dispatcher stages a lead sheet in dry-run mode by default', () => {
      const { stdout } = executeSkillSource(dispatcher.manifest.sourceCode as string, {
        operation: 'format-lead-sheet',
        title: 'Test Song',
        lyrics: 'Verse line one\nChorus line two',
        chords: ['I', 'V', 'vi', 'IV'],
      });
      const parsed = JSON.parse(stdout.trim());
      expect(parsed.success).toBe(true);
      expect(parsed.data.mode).toBe('dry-run');
      expect(parsed.data.connected).toBe(false);
      expect(parsed.data.artifact).toBeDefined();
      expect(parsed.data.artifact.title).toBe('Test Song');
      expect(parsed.data.artifact.operation).toBe('format-lead-sheet');
      expect(parsed.data.artifact.format).toBe('lead-sheet');
      expect(parsed.data.storePath).toContain('lead-sheets.json');
      expect(parsed.data.message).toContain('Not connected');
    });

    it('dispatcher stages registration records separately', () => {
      const { stdout } = executeSkillSource(dispatcher.manifest.sourceCode as string, {
        operation: 'stage-registration',
        title: 'Registered Song',
        registration: {
          writers: ['Songwriter A'],
          publishers: ['Publisher B'],
          rightsNote: 'All rights reserved',
        },
      });
      const parsed = JSON.parse(stdout.trim());
      expect(parsed.success).toBe(true);
      expect(parsed.data.mode).toBe('dry-run');
      expect(parsed.data.artifact.operation).toBe('stage-registration');
      expect(parsed.data.storePath).toContain('registration-records.json');
    });

    it('dispatcher reports honest not-connected status when no endpoint configured', () => {
      const { stdout } = executeSkillSource(dispatcher.manifest.sourceCode as string, {
        operation: 'format-lead-sheet',
        title: 'Test',
        lyrics: 'test lyrics',
      });
      const parsed = JSON.parse(stdout.trim());
      expect(parsed.data.connected).toBe(false);
      expect(parsed.data.message).toContain('Not connected');
    });

    it('dispatcher does not attempt live fetch in default dry-run mode', () => {
      const source = dispatcher.manifest.sourceCode as string;
      const { stdout } = executeSkillSource(source, {
        operation: 'format-lead-sheet',
        title: 'Test',
        lyrics: 'test lyrics',
      });
      const parsed = JSON.parse(stdout.trim());
      expect(parsed.data.mode).toBe('dry-run');
      expect(parsed.data.response).toBeNull();
    });
  });
});
