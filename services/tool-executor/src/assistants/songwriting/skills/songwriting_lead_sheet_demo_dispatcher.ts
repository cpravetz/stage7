// @ts-nocheck

import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';

const SONGWRITER_DISPATCH_CONFIG_SCHEMA = {
  type: 'object',
  properties: {
    endpointUrl: SchemaProps.url({ title: 'Endpoint URL', description: 'Lead-sheet, demo-asset, or registration endpoint URL', order: 1, hint: 'Provider endpoint for live dispatch of lead sheets, demo metadata, or registration records' }),
    provider: SchemaProps.select(['custom', 'daw', 'registration-portal'], { title: 'Provider', description: 'Configured asset or registration provider', order: 3, default: 'custom', hint: 'Select the service that will receive dispatched assets' }),
    defaultFormat: SchemaProps.select(['lead-sheet', 'demo-metadata', 'registration'], { title: 'Default Format', description: 'Default dispatch artifact format', order: 4, default: 'lead-sheet', hint: 'Default artifact type when none is specified at dispatch time' }),
  },
};

export const leadSheetDemoDispatcher = createDeclarativeCodeSkill({
  id: 'songwriting_lead_sheet_demo_dispatcher',
  name: 'Represent Lead Sheet & Demo Asset Dispatcher',
  description: 'Parses final lyrics into sections, aligns the supplied chord symbols to the line they belong on, renders a column-aligned lead sheet, builds demo metadata (key, tempo, duration, section and line counts) or a copyright registration record, stages the artifact locally, and only dispatches to a configured provider after explicit confirmation.',
  persistenceEnvVar: 'SONGWRITING_HOME',
  inputSchema: {
    type: 'object',
    properties: {
      draftId: SchemaProps.text({ title: 'Draft ID', description: 'Optional source draft identifier', order: 1, hint: 'Links the staged artifact to its source draft' }),
      title: SchemaProps.text({ title: 'Title', description: 'Song title for the lead sheet or registration record', order: 2, default: 'Untitled song', hint: 'Display title for the formatted artifact' }),
      lyrics: SchemaProps.textarea({ title: 'Lyrics', description: 'Final lyric text to format', order: 3, hint: 'Complete lyric text. Section labels like [Chorus] are used to lay out the lead sheet' }),
      chords: SchemaProps.stringArray({ title: 'Chords', description: 'Chord symbols applied in order across the lyric lines', order: 4, hint: 'e.g. I, V, vi, IV. Each symbol is aligned to the next lyric line' }),
      format: SchemaProps.select(['lead-sheet', 'demo-metadata', 'registration'], { title: 'Format', description: 'Artifact format to produce', order: 5, default: 'lead-sheet', hint: 'lead-sheet renders chords over lyrics; demo-metadata adds key, tempo and duration; registration requires writers' }),
      key: SchemaProps.text({ title: 'Key', description: 'Song key, used in the lead sheet and demo metadata', order: 6, hint: 'e.g. C major' }),
      tempo: SchemaProps.number({ title: 'Tempo', description: 'Tempo in beats per minute', order: 7, minimum: 20, maximum: 300, hint: 'Recorded on the lead sheet header and demo metadata' }),
      durationSeconds: SchemaProps.number({ title: 'Duration', description: 'Track duration in seconds', order: 8, minimum: 1, hint: 'Rendered as m:ss on the demo metadata' }),
      registration: SchemaProps.object({
        writers: SchemaProps.stringArray({ title: 'Writers', description: 'Songwriter names for registration metadata', order: 1, hint: 'Required when format is registration' }),
        publishers: SchemaProps.stringArray({ title: 'Publishers', description: 'Publisher names for registration metadata', order: 2, hint: 'List of publisher names for registration' }),
        rightsNote: SchemaProps.text({ title: 'Rights Note', description: 'Rights or ownership note for the staged record', order: 3, hint: 'Any rights or ownership clarification for the record' }),
      }, { title: 'Registration', description: 'Copyright or registration metadata', order: 9, hint: 'Include writer/publisher metadata when staging a registration record' }),
      dryRun: SchemaProps.boolean({ title: 'Dry Run', description: 'Stage the artifact without sending it; defaults to true', order: 11, default: true, hint: 'When true, no request leaves the system even if an endpoint is configured' }),
      confirmation: SchemaProps.boolean({ title: 'Confirmation', description: 'Explicit approval for a live dispatch', order: 12, default: false, hint: 'Set to true only when authorizing a live dispatch to the configured endpoint' }),
    },
    required: ['format'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean', description: 'Whether staging or dispatch completed successfully' },
      status: { type: 'string', description: 'Artifact status: dry-run, staged, live, or error' },
      connected: { type: 'boolean', description: 'Whether a configured endpoint was actually used for dispatch' },
      artifact: { type: 'object', description: 'Formatted lead sheet, demo metadata, or registration artifact' },
      response: { type: ['object', 'null'], description: 'Provider response when a live dispatch is attempted' },
      storePath: { type: 'string', description: 'Category-specific local staging path in SONGWRITING_HOME' },
      message: { type: 'string', description: 'Human-readable staging or dispatch status' },
        present: {
      type: 'array',
      description: 'Pre-formatted, user-facing text blocks. This is how a skill controls its own layout without the renderer needing any knowledge of the skill.',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Stable identifier for the block' },
          title: { type: 'string', description: 'Optional heading shown above the block' },
          kind: { type: 'string', description: "How to interpret the body. Defaults to 'text'." },
          body: { type: 'string', description: 'Pre-formatted plain text, rendered verbatim with line breaks preserved' },
        },
        required: ['id', 'body'],
      },
    },
      error: { type: ['string', 'null'], description: 'Dispatch error message when status is error' },
    },
    required: ['success', 'status', 'connected', 'artifact', 'storePath', 'message', 'present'],
  },
  triggers: [
    { kind: 'user', phrase_examples: ['Format this song as a lead sheet', 'Prepare demo metadata'] },
  ],
    // v9: an aid Skill assembles aids and returns a work product; it does not
    // write to an external system. This one dispatches an asset to a provider,
    // so it is represent and sits behind the approval gate.
    tier: 'represent',
  domainKnowledge: 'Songwriting lead sheet formatting, demo metadata preparation, and asset dispatch',
  isSkill: true,
  manifest: {
    emitEvent: 'songwriting.song_asset.dispatched',
    // Declaring the external action is what lets the platform reason about
    // this Skill: it reaches a provider, so the gate backstop applies even
    // though the tier alone would leave it open. It also makes the
    // aid/represent mismatch visible to `adk:validate` instead of hiding it.
    system: 'songwriting-provider',
    action: 'dispatch-demo-asset',
    // Declared as a credential, not a plain config field, so the key can come from
    // the vault via `vault:<id>` and is never echoed back into emitted output.
    credentialSource: {
      apiKey: { configKey: 'apiKey', required: false, label: "upstream service API key (set in this Skill configuration, or a vault secret)" },
    },
    configSchema: SONGWRITER_DISPATCH_CONFIG_SCHEMA,
    endpointConfigKey: 'endpointUrl',
  },
  handler: async function handler(input, ctx) {
      const title = String(input.title || 'Untitled song');
      const lyrics = String(input.lyrics || '');
      const chords = Array.isArray(input.chords) ? input.chords : [];
      const artifactFormat = String(input.format || 'lead-sheet');
      const registration = input.registration || null;
      const tempo = Number(input.tempo || 0);
      const key = String(input.key || '');
      const durationSeconds = Number(input.durationSeconds || 0);

      const SECTION_LABEL = /^\s*[\[(]?\s*(intro|verse|pre|chorus|refrain|hook|bridge|breakdown|drop|outro|interlude|instrumental|tag|coda|post)\b[^\])\n]*[\])]?\s*:?\s*$/i;

      // Split the lyric into sections and attach the supplied chord symbols so a lead sheet shows
      // chords against the line they belong to instead of a bare chord list.
      const sections = [];
      {
      let current = { label: 'Verse 1', lines: [] };
      lyrics.split(/\r?\n/).forEach(function (line) {
        const trimmed = line.trim();
        if (!trimmed) return;
        if (SECTION_LABEL.test(trimmed)) {
          if (current.lines.length) sections.push(current);
          current = { label: trimmed.replace(/^[\[(]|[:\])]?\s*$/g, '').trim() || trimmed, lines: [] };
          return;
        }
        current.lines.push(trimmed);
      });
      if (current.lines.length) sections.push(current);
      }
      if (!sections.length && lyrics.trim()) {
      sections.push({ label: 'Verse 1', lines: lyrics.split(/\r?\n/).filter(function (l) { return l.trim(); }).map(function (l) { return l.trim(); }) });
      }

      let chordCursor = 0;
      const sectionedLyrics = sections.map(function (section) {
      const lines = section.lines.map(function (text) {
        const chord = chords[chordCursor];
        if (chord) chordCursor += 1;
        return { chord: chord || null, text: text };
      });
      return { label: section.label, lines: lines };
      });

      function padColumns(rows) {
      return rows.map(function (row) {
        const width = row.reduce(function (max, cell) { return Math.max(max, cell.length); }, 0);
        return row.map(function (cell) { return cell + ' '.repeat(width - cell.length); }).join('  ');
      });
      }

      function renderLeadSheet() {
      // The renderer prints the block title, so the body starts with the musical detail.
      const out = ['Key: ' + (key || 'not set') + '   Tempo: ' + (tempo ? tempo + ' BPM' : 'not set'), ''];
      sectionedLyrics.forEach(function (section) {
        out.push('[' + section.label.toUpperCase() + ']');
        out.push(padColumns(section.lines.map(function (line) { return [line.chord || '', line.text]; })).join('\n'));
        out.push('');
      });
      return out.join('\n');
      }

      function formatDuration(seconds) {
      const m = Math.floor(seconds / 60);
      const s = Math.round(seconds % 60);
      return m + ':' + (s < 10 ? '0' + s : String(s));
      }

      if (artifactFormat === 'registration' && (!registration || !Array.isArray(registration.writers) || !registration.writers.length)) {
        return {
          success: false,
          error: 'A registration record needs at least one songwriter name.',
          present: [{ id: 'message', title: 'Not completed', kind: 'text', body: 'A registration record needs at least one songwriter name.' }],
        };
      }

      const leadSheet = renderLeadSheet();
      const wordCount = sectionedLyrics.reduce(function (sum, s) {
      return sum + s.lines.reduce(function (inner, l) { return inner + l.text.split(/\s+/).filter(Boolean).length; }, 0);
      }, 0);

      const artifact = {
      id: 'song_asset_' + Date.now(),
      title: title,
      format: artifactFormat,
      key: key || null,
      tempoBpm: tempo || null,
      duration: durationSeconds ? formatDuration(durationSeconds) : null,
      durationSeconds: durationSeconds || null,
      sectionCount: sectionedLyrics.length,
      lineCount: sectionedLyrics.reduce(function (sum, s) { return sum + s.lines.length; }, 0),
      wordCount: wordCount,
      chords: chords,
      sectionedLyrics: sectionedLyrics,
      lyrics: lyrics,
      leadSheet: artifactFormat === 'lead-sheet' ? leadSheet : null,
      registration: artifactFormat === 'registration' ? registration : null,
      createdAt: new Date().toISOString(),
      };

      const store = ctx.store.load('lead-sheets', []);
      store.push({ ...artifact, status: 'staged' });
      ctx.store.save('lead-sheets', store);

      const endpoint = String(input.endpointUrl || String(ctx.config?.endpointUrl || ''));
      const apiKey = String((ctx.getCredential ? ctx.getCredential('apiKey') : undefined) || '');
      const dryRun = input.dryRun !== false;
      const confirmed = input.confirmation === true || input.confirmed === true;

      const result = {
      success: true,
      status: dryRun ? 'dry-run' : 'staged',
      connected: false,
      artifact: artifact,
      storePath: ctx.store.getFilePath('lead-sheets'),
      response: null,
      message: '',
      };

      if (shouldDispatch(endpoint, dryRun, confirmed)) {
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers['X-API-Key'] = apiKey;
      try {
        const response = await fetch(endpoint, { method: 'POST', headers: headers, body: JSON.stringify(artifact) });
        const text = await response.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch (_) { data = { text: text }; }
        result.status = 'live';
        result.connected = true;
        result.response = { status: response.status, data: data };
        result.message = response.ok
          ? 'Artifact dispatched to ' + endpoint + ' after confirmation.'
          : 'Endpoint ' + endpoint + ' returned HTTP ' + response.status + '. The staged artifact remains available locally.';
      } catch (error) {
        result.success = false;
        result.status = 'error';
        result.message = 'Dispatch to ' + endpoint + ' failed. The staged artifact remains available locally.';
        result.error = error && error.message ? error.message : String(error);
      }
      } else if (dryRun) {
      result.message = endpoint
        ? 'Artifact staged and formatted. Set dryRun to false and pass confirmation true to dispatch to ' + endpoint + '.'
        : 'Artifact staged and formatted locally. No asset endpoint is configured, so nothing was sent.';
      } else if (!endpoint) {
      result.message = 'Not connected: no asset endpoint is configured, so nothing was dispatched. The formatted artifact is staged locally.';
      } else {
      result.message = 'Dispatch to ' + endpoint + ' requires explicit confirmation. Re-run with confirmation true to send.';
      }

      // The skill renders its own artifact layout. 'present' is the generic block contract a renderer
      // understands, so no core code needs to know that this skill produces a lead sheet.
      const present = [];
      if (artifactFormat === 'lead-sheet' && leadSheet) {
      present.push({ id: 'lead-sheet', title: 'Lead Sheet - ' + title, kind: 'text', body: leadSheet });
      }
      present.push({ id: 'status', title: 'Dispatch Status', kind: 'text', body: 'Status: ' + result.status + '\nEndpoint: ' + (endpoint || 'not configured') + '\nStored at: ' + ctx.store.getFilePath('lead-sheets') + '\n' + result.message });

      function shouldDispatch(ep, isDryRun, isConfirmed) {
      return Boolean(ep) && !isDryRun && isConfirmed;
      }

      return result;
    }
  });
