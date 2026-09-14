#!/usr/bin/env node
'use strict';

// Generate docs/NEXTGEN_MISSING_SKILLS.md skill-schema appendix.
// Run with: node scripts/generate-skill-schema-docs.js
// No ts-node dependency required.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const SKILLS_DIR = path.join(ROOT, 'services', 'tool-executor', 'src', 'data', 'skills');
const DOC_PATH = path.join(ROOT, 'docs', 'NEXTGEN_MISSING_SKILLS.md');

const CATEGORIES = [
  'analytics', 'career', 'content', 'creative', 'cto', 'education', 'event',
  'executive', 'finance', 'healthcare', 'hotel', 'hr', 'investment', 'legal',
  'marketing', 'product', 'restaurant', 'sales', 'sports', 'support',
];

const EXPORT_KEYS = {
  analytics: 'analyticsSkills', career: 'careerSkills', content: 'contentSkills',
  creative: 'creativeSkills', cto: 'ctoSkills', education: 'educationSkills',
  event: 'eventSkills', executive: 'executiveSkills', finance: 'financeSkills',
  healthcare: 'healthcareSkills', hotel: 'hotelSkills', hr: 'hrSkills',
  investment: 'investmentSkills', legal: 'legalSkills', marketing: 'marketingSkills',
  product: 'productSkills', restaurant: 'restaurantSkills', sales: 'salesSkills',
  sports: 'sportsSkills', support: 'supportSkills',
};

const DISPLAY_NAMES = {
  analytics: 'Analytics', career: 'Career', content: 'Content', creative: 'Creative',
  cto: 'CTO', education: 'Education', event: 'Event', executive: 'Executive',
  finance: 'Finance', healthcare: 'Healthcare', hotel: 'Hotel Ops', hr: 'HR',
  investment: 'Investment Advisor', legal: 'Legal', marketing: 'Marketing',
  product: 'PM', restaurant: 'Restaurant Ops', sales: 'Sales',
  sports: 'Sports Wager Advisor', support: 'Support',
};

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Normalize shorthand schemas like { success: "boolean" } or { data: ["object","string","null"] }
// into JSON-Schema-shaped objects recursively.
function normalizeSchema(schema) {
  if (!isPlainObject(schema)) {
    if (Array.isArray(schema)) return schema;
    return schema;
  }
  const out = { ...schema };

  // Collapse ["object","null"] -> "object" and ["string","null"] -> "string" etc.
  if (Array.isArray(out.type) && out.type.includes('null')) {
    const nonNull = out.type.filter((t) => t !== 'null');
    out.type = nonNull.length === 1 ? nonNull[0] : nonNull;
  }

  if (out.properties && isPlainObject(out.properties)) {
    const props = {};
    for (const [k, v] of Object.entries(out.properties)) {
      props[k] = normalizeSchema(v);
    }
    out.properties = props;
  }

  if (Array.isArray(out.items)) {
    out.items = out.items.map((it) => normalizeSchema(it));
  } else if (isPlainObject(out.items)) {
    out.items = normalizeSchema(out.items);
  }

  if (Array.isArray(out.additionalProperties) && out.additionalProperties.length) {
    out.additionalProperties = out.additionalProperties.map((it) => normalizeSchema(it));
  } else if (isPlainObject(out.additionalProperties)) {
    out.additionalProperties = normalizeSchema(out.additionalProperties);
  }

  // Top-level shorthand map: { success: "boolean", data: "object" } (no type/properties)
  if (!out.type && !out.properties && !out.items) {
    const keys = Object.keys(out);
    if (keys.length) {
      const props = {};
      for (const [k, v] of Object.entries(out)) {
        props[k] = normalizeSchema(v);
      }
      return { type: 'object', properties: props };
    }
  }

  return out;
}

// Transpile a .ts file to CommonJS source using the TypeScript compiler.
function transpile(filePath) {
  const src = fs.readFileSync(filePath, 'utf-8');
  const result = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      skipLibCheck: true,
      resolveJsonModule: true,
    },
    fileName: filePath,
  });
  return result.outputText;
}

// Resolve a relative import inside a transpiled module to an absolute .ts path.
function resolveImport(fromFile, id) {
  if (id.startsWith('.')) {
    const resolved = path.resolve(path.dirname(fromFile), id);
    return path.extname(resolved) ? resolved : resolved + '.ts';
  }
  return id;
}

// Load a module (transpiled on the fly) into an isolated VM context.
function loadModule(file, cache) {
  const resolved = path.resolve(file);
  if (cache.has(resolved)) return cache.get(resolved).exports;
  const mod = { exports: {} };
  cache.set(resolved, mod);
  const code = transpile(resolved);
  const sandbox = {
    module: mod,
    exports: mod.exports,
    require: (id) => loadModule(resolveImport(resolved, id), cache),
    console,
    JSON, Object, Array, String, Number, Boolean, Date, Math, RegExp,
    Error, TypeError, undefined, parseInt, parseFloat, isNaN, isFinite,
    process, Buffer, setTimeout, clearTimeout, fetch, AbortController,
    globalThis: null,
  };
  vm.runInContext(code, vm.createContext(sandbox));
  return mod.exports;
}

function loadCategory(category, cache) {
  const catPath = path.join(SKILLS_DIR, category, 'index.ts');
  if (!fs.existsSync(catPath)) return null;
  const exp = loadModule(catPath, cache);
  const key = EXPORT_KEYS[category];
  let arr = exp[key] || exp.default;
  if (!Array.isArray(arr)) {
    throw new Error('Category ' + category + ' does not export an array (keys: ' + Object.keys(exp).join(',') + ')');
  }
  return arr;
}

function collectTools() {
  const cache = new Map();
  // Pre-load the shared factory so its exports are available to every category.
  loadModule(path.join(SKILLS_DIR, 'code-skill-factory.ts'), cache);

  const results = [];
  for (const category of CATEGORIES) {
    let arr;
    try {
      arr = loadCategory(category, cache);
    } catch (err) {
      console.error('Failed to load category ' + category + ':', err.message);
      continue;
    }
    const sourcePath = path.join('services', 'tool-executor', 'src', 'data', 'skills', category, 'index.ts');
    for (const tool of arr) {
      results.push({ category, tool, sourcePath });
    }
  }
  return results;
}

function generateMarkdown(tools) {
  const lines = [];
  const push = (...args) => lines.push(...args);

  push('## Skill Schema Appendix');
  push('');
  push('> **Status: GENERATED.** This appendix is auto-generated from the category source exports.');
  push('>');
  push('> Do not edit by hand; regenerate with the generator script.');
  push('');
  push('### Schema Reference');
  push('');
  push('For each skill, the appendix lists:');
  push('');
  push('- **Persistent config schema** — manifest.configSchema (empty when no persistent settings are defined).');
  push('- **Runtime input schema** — top-level inputSchema.');
  push('- **Runtime output schema** — top-level outputSchema.');
  push('');
  push('Shorthand schemas (e.g. `{ success: "boolean" }`) are normalized into JSON-Schema-shaped representations.');
  push('The source file remains authoritative.');
  push('');
  push('---');
  push('');

  const categories = [...new Set(tools.map((t) => t.category))].sort();
  let totalSkills = 0;

  for (const category of categories) {
    const categoryTools = tools.filter((t) => t.category === category);
    push('### ' + (DISPLAY_NAMES[category] || capitalize(category)));
    push('');
    push('> Category source: `' + path.join('services', 'tool-executor', 'src', 'data', 'skills', category, 'index.ts') + '`');
    push('');

    categoryTools.forEach((item) => {
      totalSkills++;
      const manifest = item.tool.manifest && isPlainObject(item.tool.manifest) ? item.tool.manifest : {};
      const configSchema = normalizeSchema(manifest.configSchema);
      const inputSchema = normalizeSchema(item.tool.inputSchema);
      const outputSchema = normalizeSchema(item.tool.outputSchema);

      const hasConfig = isPlainObject(manifest.configSchema) && Object.keys(manifest.configSchema).length > 0;
      const configDisplay = hasConfig ? JSON.stringify(configSchema, null, 2) : '{}';

      push('#### `' + item.tool.id + '`');
      push('');
      push('**Name:** ' + item.tool.name);
      push('');
      push('**Persistent config schema:**');
      push('');
      push('```json');
      push(configDisplay);
      push('```');
      if (!hasConfig) {
        push('');
        push('*No persistent settings are defined for this skill.*');
      }
      push('');
      push('**Runtime input schema:**');
      push('');
      push('```json');
      push(JSON.stringify(inputSchema, null, 2));
      push('```');
      push('');
      push('**Runtime output schema:**');
      push('');
      push('```json');
      push(JSON.stringify(outputSchema, null, 2));
      push('```');
      push('');
      push('**Source:** [`' + path.basename(item.sourcePath || '') + '`](' + (item.sourcePath || '') + ')');
      push('');
    });
  }

  push('---');
  push('');
  push('**Total skills catalogued:** ' + totalSkills);
  push('');
  push('### Regeneration');
  push('');
  push('```bash');
  push('node scripts/generate-skill-schema-docs.js');
  push('```');
  push('');
  push('The script imports the live category modules, extracts manifest.configSchema, inputSchema, and outputSchema');
  push('for each Tool, normalizes shorthand types into JSON-Schema-shaped objects, and replaces the content');
  push('between the appendix markers in this document.');

  return lines.join('\n');
}

function main() {
  const tools = collectTools();
  console.log('Collected ' + tools.length + ' skills across ' + new Set(tools.map((t) => t.category)).size + ' categories');

  const markdown = generateMarkdown(tools);

  let existingContent = '';
  if (fs.existsSync(DOC_PATH)) {
    existingContent = fs.readFileSync(DOC_PATH, 'utf-8');
  }

  const appendixMarker = '<!-- SKILL_SCHEMA_APPENDIX_START -->';
  const appendixEndMarker = '<!-- SKILL_SCHEMA_APPENDIX_END -->';

  const appendixStartIndex = existingContent.indexOf(appendixMarker);
  const appendixEndIndex = existingContent.lastIndexOf(appendixEndMarker);

  let newContent;
  if (appendixStartIndex !== -1 && appendixEndIndex !== -1 && appendixEndIndex > appendixStartIndex) {
    const before = existingContent.slice(0, appendixStartIndex).replace(/\n{3,}/g, '\n\n');
    const after = existingContent.slice(appendixEndIndex + appendixEndMarker.length).replace(/\n{3,}/g, '\n\n');
    newContent = before + appendixMarker + '\n\n' + markdown + '\n\n' + appendixEndMarker + '\n' + after;
  } else {
    newContent = existingContent + '\n\n' + appendixMarker + '\n\n' + markdown + '\n\n' + appendixEndMarker + '\n';
  }

  // Collapse any accidental triple+ blank lines produced by marker surgery.
  newContent = newContent.replace(/\n{3,}/g, '\n\n');
  // Ensure file ends with a single newline.
  newContent = newContent.replace(/\n+$/, '\n');

  fs.writeFileSync(DOC_PATH, newContent, 'utf-8');
  console.log('Updated ' + DOC_PATH);
}

main();
