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
  it('exports exactly four skills', () => {
    expect(songwritingSkills).toHaveLength(4);
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

  describe('trigger classification', () => {
    it('Songwriter has exactly three user-triggered skills (design §9)', () => {
      // The prosody evaluator joins the co-creation and lead-sheet skills: it
      // takes the lyrics as its input and blocks without them, so it cannot be
      // driven by an event the way it was declared.
      const userTriggered = songwritingSkills.filter((s) =>
        (s.triggers || []).some((t) => t.kind === 'user')
      );
      expect(userTriggered.length).toBe(3);
      const userTriggerIds = userTriggered.map((s) => s.id).sort();
      expect(userTriggerIds).toEqual([
        'songwriting_lead_sheet_demo_dispatcher',
        'songwriting_lyric_prosody_evaluator',
        'songwriting_musical_lyric_cocreation',
      ]);
    });

    it('all user-triggered skills have proper phrase_examples', () => {
      for (const skill of songwritingSkills) {
        const userTriggers = (skill.triggers || []).filter((t) => t.kind === 'user');
        for (const t of userTriggers) {
          expect(t.kind).toBe('user');
          expect(Array.isArray((t as { phrase_examples: string[] }).phrase_examples)).toBe(true);
          expect((t as { phrase_examples: string[] }).phrase_examples.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('SONGWRITING_HOME persistence', () => {
    it('all three source codes reference SONGWRITING_HOME', () => {
      const localSkills = songwritingSkills.filter((s) => s.id !== 'songwriter_genre_trend_evaluator');
      for (const skill of localSkills) {
        const source = skill.manifest.sourceCode as string;
        expect(source).toContain('SONGWRITING_HOME');
      }
    });

    it('evaluator targets the lyric-evaluations store key', () => {
      const skill = skillsByName['Advise Lyric & Structural Prosody Evaluator'];
      expect(skill.manifest.sourceCode).toContain('lyric-evaluations');
      expect(skill.manifest.persistenceEnvVar).toBe('SONGWRITING_HOME');
    });

    it('co-creation targets the drafts store key', () => {
      const skill = skillsByName['Aid Musical & Lyric Co-Creation Engine'];
      expect(skill.manifest.sourceCode).toContain('drafts');
      expect(skill.manifest.persistenceEnvVar).toBe('SONGWRITING_HOME');
    });

    it('dispatcher targets the lead-sheets store key', () => {
      const skill = skillsByName['Represent Lead Sheet & Demo Asset Dispatcher'];
      expect(skill.manifest.sourceCode).toContain('lead-sheets');
      expect(skill.manifest.persistenceEnvVar).toBe('SONGWRITING_HOME');
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
      // apiKey is a declared credential, not a config field, so it never renders as
      // something the user is asked to supply on the Run form.
      const credentialSource = dispatcher.manifest.credentialSource as Record<string, unknown>;
      expect(credentialSource?.apiKey).toBeDefined();
      expect(configProps.apiKey).toBeUndefined();
      expect(configProps.provider).toBeDefined();
      expect(configProps.defaultFormat).toBeDefined();
      expect(configProps.confirmBeforeSend).toBeDefined();
    });

    it('declares the config field holding its endpoint', () => {
      expect(dispatcher.manifest.endpointConfigKey).toBe('endpointUrl');
    });

    it('source code defaults to dry-run mode', () => {
      const source = dispatcher.manifest.sourceCode as string;
      expect(source).toContain("status: dryRun ? 'dry-run' : 'staged'");
      expect(source).toContain("connected: false");
    });

    it('source code gates live dispatch behind dryRun === false and confirmation', () => {
      const source = dispatcher.manifest.sourceCode as string;
      expect(source).toContain("input.dryRun !== false");
      expect(source).toContain("input.confirmed === true");
      expect(source).toContain("input.confirmation === true");
      // shouldDispatch must require an endpoint, an explicit live flag, and confirmation.
      expect(source).toContain('Boolean(ep) && !isDryRun && isConfirmed');
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
      expect(source).toContain('lineMetrics');
      expect(source).toContain('rhymePairs');
      expect(source).toContain('meterVariance');
      expect(source).toContain('meterConsistency');
      expect(source).toContain('recommendations');
    });

    it('co-creation source contains chord progression and section generation logic', () => {
      const skill = skillsByName['Aid Musical & Lyric Co-Creation Engine'];
      const source = skill.manifest.sourceCode as string;
      expect(source).toContain('progression');
      expect(source).toContain('sectionNames');
      expect(source).toContain('sections');
      expect(source).toContain('beatSheet');
      expect(source).toContain('rhymeScheme');
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

    it('dispatcher is a declarative code skill behind withConfirmation', () => {
      const dispatcher = skillsByName['Represent Lead Sheet & Demo Asset Dispatcher'];
      expect(dispatcher.type).toBe('code');
      expect(dispatcher.manifest.sourceCode).toBeTruthy();
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
      expect(parsed.error).toContain('Paste lyrics');
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
      expect(parsed.data.storePath).toContain('lyric-evaluations');
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
      expect(Array.isArray(parsed.data.draft.sections[0].chordProgression)).toBe(true);
      expect(parsed.data.draft.sections[0]).toHaveProperty('lines');
      expect(parsed.data.draft.sections[0]).toHaveProperty('purpose');
      expect(parsed.data.draft.sections[0]).toHaveProperty('transition');
      // Progressions are per section now, so the song-level field is the vocabulary they draw from.
      expect(parsed.data.draft.chordVocabulary).toEqual(expect.arrayContaining(['I', 'V', 'vi', 'IV']));
      expect(parsed.data.draft.verseLinesAreDistinct).toBe(true);
      expect(parsed.data.draft.beatSheet).toBeDefined();
      expect(parsed.data.draft.source).toBe('local');
      expect(parsed.data.storePath).toContain('drafts');
      const song = (parsed.present || []).find((b: any) => b.id === 'song');
      expect(song).toBeDefined();
      expect(song.body).toContain('--- LYRICS & CHORDS ---');
      expect(song.body).toContain('--- BEAT SHEET ---');
    });

    it('co-creation engine is deterministic for the same seed', () => {
      const input1 = { theme: 'love', genre: 'pop', mood: 'hopeful', seed: 99, save: false };
      const input2 = { theme: 'love', genre: 'pop', mood: 'hopeful', seed: 99, save: false };
      const { stdout: out1 } = executeSkillSource(cocreation.manifest.sourceCode as string, input1);
      const { stdout: out2 } = executeSkillSource(cocreation.manifest.sourceCode as string, input2);
      const draft1 = JSON.parse(out1.trim()).data.draft;
      const draft2 = JSON.parse(out2.trim()).data.draft;
      expect(draft1.sections[0].lines[0]).toBe(draft2.sections[0].lines[0]);
      expect(draft1.sections[0].chordProgression).toEqual(draft2.sections[0].chordProgression);
    });

    it('dispatcher stages a lead sheet locally by default', () => {
      const { stdout } = executeSkillSource(dispatcher.manifest.sourceCode as string, {
        title: 'Test Song',
        lyrics: 'Verse line one\nChorus line two',
        chords: ['I', 'V', 'vi', 'IV'],
      });
      const parsed = JSON.parse(stdout.trim());
      expect(parsed.success).toBe(true);
      expect(parsed.status).toBe('dry-run');
      expect(parsed.connected).toBe(false);
      expect(parsed.artifact).toBeDefined();
      expect(parsed.artifact.title).toBe('Test Song');
      expect(parsed.artifact.format).toBe('lead-sheet');
      expect(parsed.storePath).toContain('lead-sheets.json');
      expect(parsed.message).toContain('No asset endpoint is configured');
    });

    it('dispatcher handles registration input through the lead-sheet path', () => {
      const { stdout } = executeSkillSource(dispatcher.manifest.sourceCode as string, {
        title: 'Registered Song',
        registration: {
          writers: ['Songwriter A'],
          publishers: ['Publisher B'],
          rightsNote: 'All rights reserved',
        },
      });
      const parsed = JSON.parse(stdout.trim());
      expect(parsed.success).toBe(true);
      expect(parsed.status).toBe('dry-run');
      expect(parsed.storePath).toContain('lead-sheets.json');
    });

    it('dispatcher reports honest not-connected status when no endpoint configured', () => {
      const { stdout } = executeSkillSource(dispatcher.manifest.sourceCode as string, {
        title: 'Test',
        lyrics: 'test lyrics',
      });
      const parsed = JSON.parse(stdout.trim());
      expect(parsed.connected).toBe(false);
      expect(parsed.message).toContain('No asset endpoint is configured');
    });

    it('dispatcher does not attempt live fetch in default dry-run mode', () => {
      const source = dispatcher.manifest.sourceCode as string;
      const { stdout } = executeSkillSource(source, {
        title: 'Test',
        lyrics: 'test lyrics',
      });
      const parsed = JSON.parse(stdout.trim());
      expect(parsed.status).toBe('dry-run');
      expect(parsed.response).toBeNull();
    });
  });
});
