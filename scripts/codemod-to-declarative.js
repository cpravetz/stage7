#!/usr/bin/env node
'use strict';

/**
 * Codemod: createCodeSkill(...) -> createDeclarativeCodeSkill({ ..., handler(input, ctx) {...} })
 *
 * Usage:
 *   node scripts/codemod-to-declarative.js <file.ts> [file2.ts ...]
 *   node scripts/codemod-to-declarative.js --dry-run <file.ts>
 *   node scripts/codemod-to-declarative.js --stdout <file.ts>
 *
 * Imperative skill bodies shipped as `manifest.sourceCode` strings become real
 * TypeScript handler bodies. The runtime already provides the storage dir,
 * store read/write, tool delegation and rendering, so the hand-rolled fs/path
 * shims are rewritten onto `ctx.store`, `ctx.delegate` and `ctx.render`.
 */

const fs = require('fs');

// ---------------------------------------------------------------------------
// Minimal JS scanner: balanced delimiters and top-level object entry splitting
// without tripping over strings, template literals, comments or regex bodies.
// ---------------------------------------------------------------------------

const RE_REGEX_ALLOWED_BEFORE = new Set([
  '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*',
  '%', '~', '^', '<', '>', '\n',
]);

function isIdentChar(c) {
  return !!c && /[A-Za-z0-9_$]/.test(c);
}

function skipQuoted(src, i) {
  const quote = src[i];
  i += 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') { i += 2; continue; }
    if (c === quote) return i + 1;
    i += 1;
  }
  return i;
}

function skipLineComment(src, i) {
  while (i < src.length && src[i] !== '\n') i += 1;
  return i;
}

function skipBlockComment(src, i) {
  const end = src.indexOf('*/', i + 2);
  return end === -1 ? src.length : end + 2;
}

/** Skip a `...` template literal, honouring `${ ... }` nesting. */
function skipTemplate(src, i) {
  i += 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '`') return i + 1;
    if (c === '$' && src[i + 1] === '{') { i = skipBalanced(src, i + 1, '{', '}'); continue; }
    i += 1;
  }
  return i;
}

function regexAllowedAt(src, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(src[j])) j -= 1;
  if (j < 0) return true;
  return RE_REGEX_ALLOWED_BEFORE.has(src[j]);
}

function skipRegexLiteral(src, i) {
  i += 1;
  let inClass = false;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) { i += 1; break; }
    else if (c === '\n') break;
    i += 1;
  }
  while (i < src.length && /[a-z]/.test(src[i])) i += 1;
  return i;
}

/** `i` points at `open`; returns the index just past the matching `close`. */
function skipBalanced(src, i, open, close) {
  let depth = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") { i = skipQuoted(src, i); continue; }
    if (c === '`') { i = skipTemplate(src, i); continue; }
    if (c === '/' && src[i + 1] === '/') { i = skipLineComment(src, i); continue; }
    if (c === '/' && src[i + 1] === '*') { i = skipBlockComment(src, i); continue; }
    if (c === '/' && regexAllowedAt(src, i)) { i = skipRegexLiteral(src, i); continue; }
    if (c === open) { depth += 1; i += 1; continue; }
    if (c === close) {
      depth -= 1;
      i += 1;
      if (depth === 0) return i;
      continue;
    }
    i += 1;
  }
  return i;
}

/** Index of the first `needle` at depth 0 outside strings/comments, or -1. */
function topLevelIndexOf(body, needle) {
  const stack = [];
  let i = 0;
  while (i < body.length) {
    const c = body[i];
    if (c === '"' || c === "'") { i = skipQuoted(body, i); continue; }
    if (c === '`') { i = skipTemplate(body, i); continue; }
    if (c === '/' && body[i + 1] === '/') { i = skipLineComment(body, i); continue; }
    if (c === '/' && body[i + 1] === '*') { i = skipBlockComment(body, i); continue; }
    if (c === '/' && regexAllowedAt(body, i)) { i = skipRegexLiteral(body, i); continue; }
    if (c === '(' || c === '[' || c === '{') { stack.push(c); i += 1; continue; }
    if (c === ')' || c === ']' || c === '}') { stack.pop(); i += 1; continue; }
    if (stack.length === 0 && c === needle) return i;
    i += 1;
  }
  return -1;
}

/** Split `body` on top-level occurrences of `sep`. */
function topLevelSplit(body, sep) {
  const parts = [];
  const stack = [];
  let start = 0;
  let i = 0;
  while (i < body.length) {
    const c = body[i];
    if (c === '"' || c === "'") { i = skipQuoted(body, i); continue; }
    if (c === '`') { i = skipTemplate(body, i); continue; }
    if (c === '/' && body[i + 1] === '/') { i = skipLineComment(body, i); continue; }
    if (c === '/' && body[i + 1] === '*') { i = skipBlockComment(body, i); continue; }
    if (c === '/' && regexAllowedAt(body, i)) { i = skipRegexLiteral(body, i); continue; }
    if (c === '(' || c === '[' || c === '{') { stack.push(c); i += 1; continue; }
    if (c === ')' || c === ']' || c === '}') { stack.pop(); i += 1; continue; }
    if (stack.length === 0 && c === sep) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
    i += 1;
  }
  parts.push(body.slice(start));
  return parts;
}

/**
 * Parse the body of an object literal into ordered entries:
 * { key, keyRaw, valueRaw, raw, start } with offsets into `body`.
 */
function parseObjectEntries(body) {
  const entries = [];
  for (const chunk of topLevelSplit(body, ',')) {
    if (chunk.trim().length === 0) continue;
    const at = body.indexOf(chunk);
    const colon = topLevelIndexOf(chunk, ':');
    if (colon === -1) {
      entries.push({ key: null, keyRaw: null, valueRaw: null, raw: chunk, start: at });
      continue;
    }
    const keyRaw = chunk.slice(0, colon).replace(/\/\/[^\n]*/g, '');
    entries.push({
      key: keyRaw.trim().replace(/^['"]|['"]$/g, ''),
      keyRaw,
      valueRaw: chunk.slice(colon + 1),
      raw: chunk,
      start: at,
    });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/**
 * Place an entry at `indent` while leaving the absolute indentation of its
 * continuation lines untouched (they still sit where the original file had them).
 */
function at(text, indent) {
  return indent + text.replace(/^[ \t\n]+/, '');
}

function indentBlock(text, indent) {
  return text
    .split('\n')
    .map((line) => (line.trim().length ? indent + line : line))
    .join('\n');
}

/** Remove up to `count` leading spaces from every non-blank line. */
function dedent(text, count) {
  const re = new RegExp('^[ \\t]{0,' + count + '}');
  return text.split('\n').map((line) => (line.trim() ? line.replace(re, '') : line)).join('\n');
}

function trimBlankEdges(text) {
  const lines = text.split('\n');
  let a = 0;
  let b = lines.length;
  while (a < b && lines[a].trim() === '') a += 1;
  while (b > a && lines[b - 1].trim() === '') b -= 1;
  return lines.slice(a, b).join('\n');
}

/** Undo the escaping applied when a JS body was embedded in a template literal. */
function unescapeTemplateBody(raw) {
  let out = '';
  for (let i = 0; i < raw.length; i += 1) {
    const c = raw[i];
    if (c !== '\\') { out += c; continue; }
    const next = raw[i + 1];
    if (next === '`') { out += '`'; i += 1; continue; }
    if (next === '$' && raw[i + 2] === '{') { out += '${'; i += 2; continue; }
    out += next === undefined ? '' : next;
    i += 1;
  }
  return out;
}

function splitArgs(args) {
  return topLevelSplit(args, ',').map((a) => a.trim()).filter((a) => a.length);
}

// ---------------------------------------------------------------------------
// Module-level constants, used to resolve ${VAR} interpolations
// ---------------------------------------------------------------------------

function collectModuleConstants(text) {
  const constants = new Map();
  const re = /^[ \t]*(?:export[ \t]+)?const[ \t]+([A-Za-z_$][A-Za-z0-9_$]*)[ \t]*=[ \t]*([^;]+);/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    const name = m[1];
    let value = m[2].trim();
    const envOr = value.match(/^process\.env\.([A-Za-z_$][A-Za-z0-9_$]*)\s*\|\|\s*([\s\S]+)$/);
    if (envOr) value = envOr[2].trim();
    const str = value.match(/^(['"])((?:\\.|(?!\1).)*)\1$/);
    if (str) constants.set(name, unescapeTemplateBody(str[2]));
    else if (/^(?:true|false|null|-?\d+(?:\.\d+)?)$/.test(value)) constants.set(name, value);
  }
  return constants;
}

// ---------------------------------------------------------------------------
// sourceCode body -> handler body
// ---------------------------------------------------------------------------

function transformBody(rawSource, constants, notes, warnings) {
  let code = unescapeTemplateBody(rawSource);

  // Persistence env and store keys, read before anything is stripped.
  let persistenceEnv = null;
  const baseDirMatch = code.match(/const\s+baseDir\s*=\s*process\.env\.([A-Za-z_$][A-Za-z0-9_$]*)/);
  if (baseDirMatch) persistenceEnv = baseDirMatch[1];

  const storeKeys = new Map();
  const pathRe = /const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*path\.join\(\s*baseDir\s*,\s*['"]([^'"]+)['"]\s*\)\s*;/g;
  let m;
  while ((m = pathRe.exec(code)) !== null) {
    storeKeys.set(m[1], m[2].replace(/\.json$/, ''));
    notes.push("store key '" + storeKeys.get(m[1]) + "' (from " + m[1] + ')');
  }
  const keyOf = (name) => (storeKeys.has(name) ? storeKeys.get(name) : name);

  // (o) resolve ${VAR} against module-level constants
  code = code.replace(/\$\{([A-Za-z_$][A-Za-z0-9_$]*)\}/g, (whole, name) => {
    if (Object.prototype.hasOwnProperty.call(constants, name)) {
      notes.push('resolved ${' + name + '}');
      return constants.get(name);
    }
    return whole;
  });

  // (o2) resolve ${JSON.stringify(VAR)} interpolations
  code = code.replace(/\$\{JSON\.stringify\(([A-Za-z_$][A-Za-z0-9_$]*)\)\}/g, (whole, name) => {
    if (constants.has(name)) {
      notes.push('resolved ${JSON.stringify(' + name + ')}');
      return JSON.stringify(constants.get(name));
    }
    warnings.push('unresolved ${JSON.stringify(' + name + ')} — replace manually');
    return '/* TODO: resolve ' + whole + ' */';
  });

  // (b) input plumbing
  code = code.replace(/^[ \t]*const\s+input\s*=\s*__tool_input\s*\|\|\s*\{\}\s*;[ \t]*\n?/gm, () => {
    notes.push('dropped `const input = __tool_input || {}`');
    return '';
  });
  code = code.replace(/__tool_input/g, 'input');
  code = code.replace(/^[ \t]*const\s+input\s*=\s*typeof\s+input\s*!==\s*['"]undefined['"]\s*(?:&&\s*input\s*\?\s*input)?\s*:\s*\{\}\s*;[ \t]*\n?/gm, () => {
    notes.push('dropped typeof-input prologue');
    return '';
  });
  code = code.replace(/^[ \t]*const\s+input\s*=\s*typeof\s+input\s*!==\s*.undefined.\s*\?\s*input\s*:\s*\{\}\s*;[ \t]*\n?/gm, () => {
    notes.push("dropped typeof-input prologue");
    return "";
  });

  // (a) node builtins
  code = code.replace(/^[ \t]*const\s+(?:fs|path)\s*=\s*require\(['"](?:fs|path)['"]\);[ \t]*\n?/gm, () => {
    notes.push('dropped node builtin require');
    return '';
  });

  // (d) path vars, then (c) baseDir
  code = code.replace(/^[ \t]*const\s+[A-Za-z_$][A-Za-z0-9_$]*\s*=\s*path\.join\(\s*baseDir\s*,[^;]*\)\s*;[ \t]*\n?/gm, () => {
    notes.push('dropped baseDir path.join (ctx.store owns the directory)');
    return '';
  });
  code = code.replace(/^[ \t]*const\s+baseDir\s*=[^;]*;[ \t]*\n?/gm, () => {
    notes.push('dropped baseDir declaration' + (persistenceEnv ? ' (' + persistenceEnv + ')' : ''));
    return '';
  });

  // (e) mkdir shims
  code = code.replace(/^[ \t]*try\s*\{\s*fs\.mkdirSync\(\s*baseDir[\s\S]*?\}\s*catch\s*\([^)]*\)\s*\{\s*\}\s*;?[ \t]*\n?/gm, () => {
    notes.push('dropped mkdirSync try/catch');
    return '';
  });
  code = code.replace(/^[ \t]*fs\.mkdirSync\(\s*baseDir[^;]*\);[ \t]*\n?/gm, () => {
    notes.push('dropped mkdirSync call');
    return '';
  });

  // (f) store loads
  code = code.replace(
    /\b(const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*fs\.existsSync\(\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\)\s*\?\s*JSON\.parse\(\s*fs\.readFileSync\(\s*[^,]+,\s*'utf8'\s*\)\s*\)\s*:\s*([\s\S]*?);/g,
    (_all, decl, name, pathVar, dflt) => {
      notes.push("store load -> ctx.store.load('" + keyOf(pathVar) + "')");
      return decl + ' ' + name + " = ctx.store.load('" + keyOf(pathVar) + "', " + dflt.trim() + ');';
    },
  );
  code = code.replace(
    /if\s*\(([^;]*?)&&\s*fs\.existsSync\(\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\)\s*\)\s*\{\s*try\s*\{\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*JSON\.parse\(\s*fs\.readFileSync\(\s*[^,]+,\s*'utf8'\s*\)\s*\)\s*;\s*\}\s*catch\s*\([^)]*\)\s*\{\s*\}\s*\}/g,
    (_all, cond, pathVar, target) => {
      notes.push("inline store load -> ctx.store.load('" + keyOf(pathVar) + "')");
      return target + ' = (' + cond.trim() + ") ? ctx.store.load('" + keyOf(pathVar) + "', []) : [];";
    },
  );
  // Handle: if (fs.existsSync(pathVar)) { try { target = JSON.parse(fs.readFileSync(pathVar, 'utf8')); } catch(e) {} }
  code = code.replace(
    /if\s*\(\s*fs\.existsSync\(\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\)\s*\)\s*\{\s*try\s*\{\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*JSON\.parse\(\s*fs\.readFileSync\(\s*\1\s*,\s*'utf8'\s*\)\s*\)\s*;\s*\}\s*catch\s*\([^)]*\)\s*\{\s*\}\s*\}/g,
    (_all, pathVar, target) => {
      notes.push("inline fs existsSync+read -> ctx.store.load('" + keyOf(pathVar) + "')");
      return target + " = ctx.store.load('" + keyOf(pathVar) + "', []);";
    },
  );
  // Handle: if (cond && fs.existsSync(pathVar)) { ... }
  code = code.replace(
    /if\s*\(([^;]*?)\s*&&\s*fs\.existsSync\(\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\)\s*\)\s*\{\s*try\s*\{\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*JSON\.parse\(\s*fs\.readFileSync\(\s*\2\s*,\s*'utf8'\s*\)\s*\)\s*;\s*\}\s*catch\s*\([^)]*\)\s*\{\s*\}\s*\}/g,
    (_all, cond, pathVar, target) => {
      notes.push("conditional fs existsSync+read -> ctx.store.load('" + keyOf(pathVar) + "')");
      return target + " = (" + cond.trim() + ") ? ctx.store.load('" + keyOf(pathVar) + "', []) : [];";
    },
  );
  code = code.replace(/^[ \t]*function\s+loadJSON\s*\([\s\S]*?\}[ \t]*$/gm, () => {
    notes.push('dropped loadJSON helper');
    return '';
  });
  code = code.replace(/([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*loadJSON\(\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\)/g, (_all, name, pathVar) => {
    notes.push("loadJSON -> ctx.store.load('" + keyOf(pathVar) + "')");
    return name + " = ctx.store.load('" + keyOf(pathVar) + "', [])";
  });
  // Also handle loadStore (same pattern, different name)
  code = code.replace(/^[ \t]*function\s+loadStore\s*\([\s\S]*?\}[ \t]*$/gm, () => {
    notes.push('dropped loadStore helper');
    return '';
  });
  code = code.replace(/([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*loadStore\(\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\)/g, (_all, name, pathVar) => {
    notes.push("loadStore -> ctx.store.load('" + keyOf(pathVar) + "')");
    return name + " = ctx.store.load('" + keyOf(pathVar) + "', [])";
  });

  // (g) store saves
  code = code.replace(
    /fs\.writeFileSync\(\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*,\s*JSON\.stringify\(([\s\S]*?),\s*(?:null|undefined)\s*,\s*\d+\s*\)\s*(?:,\s*(?:'utf8'|\{[\s\S]*?\})\s*)?\)\s*;/g,
    (_all, pathVar, payload) => {
      notes.push("store save -> ctx.store.save('" + keyOf(pathVar) + "')");
      return "ctx.store.save('" + keyOf(pathVar) + "', " + payload.trim() + ');';
    },
  );

  // (h) storePath reporting
  code = code.replace(/(\.[A-Za-z_$][A-Za-z0-9_$]*\s*=\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*;/g, (all, lhs, name) => (
    /storePath/i.test(lhs) && storeKeys.has(name)
      ? lhs + "ctx.store.getFilePath('" + keyOf(name) + "');"
      : all
  ));
  code = code.replace(/\bstorePath\s*:\s*([A-Za-z_$][A-Za-z0-9_$]*)/g, (all, name) => (
    storeKeys.has(name) ? "storePath: ctx.store.getFilePath('" + keyOf(name) + "')" : all
  ));

  // (i) delegation probe, (j) delegation calls
  code = code.replace(
    /^[ \t]*const\s+executeTool\s*=\s*typeof\s+__execute_tool\s*===\s*'function'\s*\?\s*__execute_tool\s*:\s*null\s*;[ \t]*\n?/gm,
    () => { notes.push('dropped executeTool probe'); return ''; },
  );
  code = code.replace(/if\s*\(\s*!executeTool\s*\)/g, 'if (!ctx.delegate)');
  code = code.replace(/\bexecuteTool\s*\(/g, 'ctx.delegate(');
  code = code.replace(/typeof\s+__execute_tool\b/g, 'ctx.delegate');

  // (k) emit definition
  const emitDefRe = /function\s+emit\s*\(/g;
  let defMatch = emitDefRe.exec(code);
  while (defMatch) {
    const braceAt = code.indexOf('{', defMatch.index);
    const end = braceAt === -1 ? code.length : skipBalanced(code, braceAt, '{', '}');
    code = code.slice(0, defMatch.index) + code.slice(end);
    notes.push('dropped emit() definition');
    defMatch = emitDefRe.exec(code);
  }

  // (l) emit calls -> return payloads
  const emitCallRe = /\bemit\s*\(/g;
  let callMatch = emitCallRe.exec(code);
  while (callMatch) {
    const open = code.indexOf('(', callMatch.index);
    const close = skipBalanced(code, open, '(', ')');
    const args = splitArgs(code.slice(open + 1, close - 1));
    let tail = code.slice(close);
    const semi = tail.indexOf(';');
    if (semi !== -1) tail = tail.slice(semi + 1);
    const present = args.length >= 5 ? args[4] : '[]';
    const replacement =
      'return { success: ' + args[0] + ', status: ' + args[1] + ', data: ' + args[2] +
      ', error: ' + args[3] + ', present: ' + present + ' };';
    code = code.slice(0, callMatch.index) + replacement + tail;
    notes.push('emit() call -> return payload');
    emitCallRe.lastIndex = callMatch.index + replacement.length;
    callMatch = emitCallRe.exec(code);
  }

  // (n) IIFE wrapper: unwrap the trailing `(async () => { ... })();` and keep its
  // try/catch, which carries the skill's own error presentation.
  const iifeRe = /\(\s*async\s*(?:function\s*)?\([^)]*\)\s*=>\s*\{/g;
  let iifeMatch = iifeRe.exec(code);
  while (iifeMatch) {
    const open = code.indexOf('{', iifeMatch.index);
    const end = skipBalanced(code, open, '{', '}');
    const after = code.slice(end);
    const tail = after.match(/^\s*\)\s*\(\s*\)\s*;?/);
    if (tail && after.slice(tail[0].length).trim() === '') {
      code =
        code.slice(0, iifeMatch.index) +
        dedent(code.slice(open + 1, end - 1), 2) +
        after.slice(tail[0].length);
      notes.push('unwrapped async IIFE');
      break;
    }
    iifeMatch = iifeRe.exec(code);
  }

  // (m) console.log(JSON.stringify(...))
  const logRe = /console\.log\(\s*JSON\.stringify\(/g;
  let logMatch = logRe.exec(code);
  while (logMatch) {
    const open = code.indexOf('(', logMatch.index);
    const close = skipBalanced(code, open, '(', ')');
    let tail = code.slice(close);
    const semi = tail.indexOf(';');
    if (semi !== -1) tail = tail.slice(semi + 1);
    code = code.slice(0, logMatch.index) + tail;
    notes.push('dropped console.log(JSON.stringify(...))');
    logMatch = logRe.exec(code);
  }

  code = trimBlankEdges(code).replace(/[ \t]+$/gm, '');

  if (!hasReachableReturn(code)) {
    const resultVar = findResultObjectVar(code);
    if (resultVar) {
      code = code.replace(/\s*$/, '') + '\n\nreturn ' + resultVar + ';';
      notes.push('added implicit `return ' + resultVar + ';`');
    } else {
      warnings.push('no top-level return and no success payload object found; manual review required');
    }
  }

  const leftovers = ['__tool_input', '__execute_tool', 'baseDir', 'fs.', 'path.join', 'require('];
  if (/(?<![.\w$])storePath\b(?!\s*:)/.test(code)) leftovers.push('storePath');
  for (const leftover of leftovers) {
    if (code.includes(leftover)) warnings.push('leftover `' + leftover + '` in handler body');
  }

  return { body: code, persistenceEnv, storeKeys };
}

const CONTROL_KEYWORDS = ['if', 'for', 'while', 'switch', 'catch', 'try', 'else', 'do', 'finally', 'function'];

function matchingOpenParenBackward(src, closeIdx) {
  let depth = 0;
  let i = closeIdx;
  while (i >= 0) {
    const c = src[i];
    if (c === ')') depth += 1;
    else if (c === '(') {
      depth -= 1;
      if (depth === 0) return i;
    }
    i -= 1;
  }
  return -1;
}

/** 'block' (statement body), 'function' (callable body) or 'object'. */
function classifyBrace(src, braceIdx) {
  let j = braceIdx - 1;
  while (j >= 0 && /\s/.test(src[j])) j -= 1;
  if (j < 0) return 'object';
  const before = src.slice(0, j + 1);
  const trailingWord = (before.match(/([A-Za-z_$][A-Za-z0-9_$]*)$/) || ['', ''])[1];
  if (CONTROL_KEYWORDS.indexOf(trailingWord) !== -1 && !/\bfunction$/.test(before)) return 'block';
  if (/=>$/.test(before)) return 'function';
  if (/\bfunction\b[\w$]*$/.test(before)) return 'function';
  if (before[before.length - 1] === ')') {
    const open = matchingOpenParenBackward(src, j);
    if (open !== -1) {
      const word = (src.slice(0, open).match(/([A-Za-z_$][A-Za-z0-9_$]*)$/) || ['', ''])[1];
      if (CONTROL_KEYWORDS.indexOf(word) !== -1) return 'block';
    }
    return 'function';
  }
  return 'object';
}

/**
 * True when the body already returns a payload from its own top level, counting
 * returns inside a top-level try/catch but not returns nested in a helper.
 */
function hasReachableReturn(code) {
  const stack = [];
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    if (c === '"' || c === "'") { i = skipQuoted(code, i); continue; }
    if (c === '`') { i = skipTemplate(code, i); continue; }
    if (c === '/' && code[i + 1] === '/') { i = skipLineComment(code, i); continue; }
    if (c === '/' && code[i + 1] === '*') { i = skipBlockComment(code, i); continue; }
    if (c === '/' && regexAllowedAt(code, i)) { i = skipRegexLiteral(code, i); continue; }
    // Delimiters nest properly in valid JS, so every closer matches the top of
    // the stack -- including a `)` that closes a paren whose argument list
    // contained an object literal.
    if (c === '(' || c === '[' || c === '{') {
      stack.push(c === '{' ? classifyBrace(code, i) : 'group');
      i += 1;
      continue;
    }
    if (c === ')' || c === ']' || c === '}') { stack.pop(); i += 1; continue; }
    if (
      code.startsWith('return', i) &&
      !isIdentChar(code[i - 1]) &&
      !isIdentChar(code[i + 6]) &&
      stack.indexOf('function') === -1
    ) {
      return true;
    }
    i += 1;
  }
  return false;
}

/** Name of the last `const X = { ... success: ... }` payload object. */
function findResultObjectVar(code) {
  const re = /const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*\{/g;
  let found = null;
  let m;
  while ((m = re.exec(code)) !== null) {
    const braceAt = code.indexOf('{', m.index);
    const end = skipBalanced(code, braceAt, '{', '}');
    if (/(^|[,{]\s*)success\s*:/.test(code.slice(braceAt, end))) found = m[1];
    re.lastIndex = end;
  }
  return found;
}

// ---------------------------------------------------------------------------
// sourceCode extraction
// ---------------------------------------------------------------------------

function extractSourceCode(fileText, valueRaw) {
  const raw = valueRaw.trim();
  let templateStart;
  let variableName = null;
  if (raw.startsWith('`')) {
    templateStart = fileText.indexOf(raw, fileText.indexOf(valueRaw));
    if (templateStart === -1) return null;
  } else if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(raw)) {
    const re = new RegExp('(?:export\\s+)?const\\s+' + raw + '\\s*=\\s*`');
    const m = re.exec(fileText);
    if (!m) return null;
    templateStart = m.index + m[0].length - 1;
    variableName = raw;
  } else {
    return null;
  }
  const end = skipTemplate(fileText, templateStart);
  return { content: fileText.slice(templateStart + 1, end - 1), variableName };
}

// ---------------------------------------------------------------------------
// createCodeSkill({...}) -> createDeclarativeCodeSkill({...})
// ---------------------------------------------------------------------------

const DROP_MANIFEST_FIELDS = ['sourceCode', 'language', 'entrypoint', 'persistenceEnv'];
const DROP_OPTION_FIELDS = ['manifest', 'sourceCode', 'language', 'entrypoint', 'persistenceEnv', 'persistenceEnvVar'];

/**
 * Fill in key/value for shorthand properties (`metadata` -> `{ metadata }`).
 * parseObjectEntries only understands `key: value`; anything that is not a bare
 * identifier (a spread such as `...rest`) is left as an unrecognised entry.
 */
function expandShorthandEntries(entries) {
  for (const entry of entries) {
    if (entry.key !== null) continue;
    const name = entry.raw.trim();
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) continue;
    entry.key = name;
    entry.keyRaw = name;
    entry.valueRaw = name;
  }
  return entries;
}

function convertCall(fileText, parenIdx, constants) {
  const braceAt = fileText.indexOf('{', parenIdx);
  if (braceAt === -1) return { status: 'failed', reason: 'no options object' };
  const closeAt = skipBalanced(fileText, braceAt, '{', '}');
  const objBody = fileText.slice(braceAt + 1, closeAt - 1);
  const entries = expandShorthandEntries(parseObjectEntries(objBody));

  const manifestEntry = entries.find((e) => e.key === 'manifest');
  if (!manifestEntry || !manifestEntry.valueRaw.trim().startsWith('{')) {
    return { status: 'skipped', reason: 'no inline manifest object' };
  }

  const manifestTrimmed = manifestEntry.valueRaw.trim();
  const manifestBody = manifestTrimmed.slice(1, -1);
  const manifestEntries = expandShorthandEntries(parseObjectEntries(manifestBody));
  const sourceEntry = manifestEntries.find((e) => e.key === 'sourceCode');
  if (!sourceEntry) return { status: 'skipped', reason: 'manifest has no sourceCode' };

  const extracted = extractSourceCode(fileText, sourceEntry.valueRaw);
  if (!extracted) {
    return { status: 'failed', reason: 'could not resolve sourceCode value: ' + sourceEntry.valueRaw.trim().slice(0, 40) };
  }

  const notes = [];
  const warnings = [];
  const result = transformBody(extracted.content, constants, notes, warnings);

  const manifestLead = manifestEntry.raw.slice(0, manifestEntry.raw.length - manifestEntry.raw.replace(/^[ \t\n]+/, '').length);
  const baseIndent = manifestLead.slice(manifestLead.lastIndexOf('\n') + 1);
  const fieldIndent = baseIndent + '  ';

  const keptManifest = manifestEntries.filter((e) => !DROP_MANIFEST_FIELDS.includes(e.key));
  const manifestText = keptManifest.length
    ? '{\n' +
      keptManifest.map((e) => at(e.keyRaw.trim() + ': ' + e.valueRaw.trim(), fieldIndent)).join(',\n') +
      '\n' + baseIndent + '}'
    : '{}';

  // `manifest.configSchema` alone never reaches `Tool.configSchema`: the factory
  // only reads the top-level option, so the caller appends a post-assignment.
  const configEntry = manifestEntries.find((e) => e.key === 'configSchema');

  let envVar = null;
  const envEntry = manifestEntries.find((e) => e.key === 'persistenceEnv');
  if (envEntry) {
    const v = envEntry.valueRaw.trim().replace(/^['"]|['"]$/g, '');
    if (/^[A-Z][A-Z0-9_]*$/.test(v)) envVar = v;
  }
  if (!envVar && result.persistenceEnv) envVar = result.persistenceEnv;
  if (!envVar) {
    warnings.push('no persistenceEnv found; defaulting to STORAGE_DIR');
    envVar = 'STORAGE_DIR';
  }

  const bodyIndent = baseIndent + '    ';
  const handlerText = at(
    'handler: async function handler(input, ctx) {\n' +
    indentBlock(result.body, bodyIndent) +
    '\n' + baseIndent + '  }',
    baseIndent,
  );

  const rebuilt = [];
  for (const entry of entries) {
    if (DROP_OPTION_FIELDS.includes(entry.key)) continue;
    rebuilt.push(at(entry.raw, baseIndent).replace(/\s+$/, ''));
    if (entry.key === 'description' && !entries.some((e) => e.key === 'persistenceEnvVar')) {
      rebuilt.push(baseIndent + "persistenceEnvVar: '" + envVar + "'");
    }
  }
  rebuilt.push(baseIndent + 'manifest: ' + manifestText);
  rebuilt.push(handlerText);

  return {
    status: 'converted',
    // The original closing brace of the options object is consumed with the
    // replaced range, so the rebuilt object has to supply its own.
    replacement: '\n' + rebuilt.join(',\n') + '\n' + baseIndent + '}',
    closeAt,
    notes,
    warnings,
    envVar,
    configSchemaRef: configEntry ? configEntry.valueRaw.trim() : null,
    storeKeys: Array.from(result.storeKeys.values()),
    variableName: extracted.variableName,
  };
}

// ---------------------------------------------------------------------------
// File driver
// ---------------------------------------------------------------------------

function transformFile(filePath, options) {
  const original = fs.readFileSync(filePath, 'utf8');
  const log = { file: filePath, calls: [], warnings: [], variableName: null };

  let text = original;
  let changed = false;
  let guard = 0;

  for (;;) {
    guard += 1;
    if (guard > 100) { log.warnings.push('aborted after 100 passes'); break; }

    const re = /(?<![A-Za-z0-9_$])createCodeSkill(?![A-Za-z0-9_$])\s*\(/g;
    const m = re.exec(text);
    if (!m) break;

    // `const TOOL = createCodeSkill({...})` -- needed for the post-assignment.
    const declMatch = new RegExp(
      '(?:export\\s+)?const\\s+([A-Za-z_$][A-Za-z0-9_$]*)\\s*(?::[^=]+)?=\\s*$',
    ).exec(text.slice(0, m.index));

    let result;
    try {
      result = convertCall(text, m.index + 'createCodeSkill'.length, collectModuleConstants(text));
    } catch (err) {
      result = { status: 'failed', reason: (err && err.message) || String(err) };
    }

    if (!result || result.status !== 'converted') {
      log.warnings.push('skipped createCodeSkill at offset ' + m.index + ': ' + ((result && result.reason) || 'unknown reason'));
      text = text.slice(0, m.index) + 'createCodeSkill__SKIPPED__' + text.slice(m.index + 'createCodeSkill'.length);
      continue;
    }

    log.calls.push(result);
    if (result.variableName && !log.variableName) log.variableName = result.variableName;
    for (const w of result.warnings) log.warnings.push(w);

    const braceAt = text.indexOf('{', m.index);
    // Where the call's closing `)` lands in the NEW text. `createCodeSkill` is
    // 12 chars shorter than `createDeclarativeCodeSkill`, so the options object
    // shifts right by that delta before the replacement is spliced in.
    const nameDelta = 'createDeclarativeCodeSkill'.length - 'createCodeSkill'.length;
    const callEnd = braceAt + 1 + nameDelta + result.replacement.length;
    text =
      text.slice(0, m.index) + 'createDeclarativeCodeSkill' +
      text.slice(m.index + 'createCodeSkill'.length, braceAt + 1) +
      result.replacement +
      text.slice(result.closeAt);

    if (result.configSchemaRef && declMatch) {
      // Skip the call's closing `)` and any statement semicolon.
      const afterCall = /^\s*\)\s*;?/.exec(text.slice(callEnd));
      const insertAt = callEnd + (afterCall ? afterCall[0].length : 0);
      const declIndent = (text.slice(0, declMatch.index).match(/\n([ \t]*)$/) || ['', ''])[1];
      text =
        text.slice(0, insertAt) +
        '\n' + declIndent + declMatch[1] + '.configSchema = ' + result.configSchemaRef + ';' +
        text.slice(insertAt);
      log.warnings.push(
        'added `' + declMatch[1] + '.configSchema = ' + result.configSchemaRef +
        '` (manifest.configSchema does not populate Tool.configSchema)',
      );
    }
    changed = true;
  }

  text = text.replace(/createCodeSkill__SKIPPED__/g, 'createCodeSkill');

  if (changed) {
    text = text.replace(
      /import\s*\{([^}]*)\}\s*from\s*(['"][^'"]*code-skill-factory['"])\s*;/,
      (all, names, mod) => {
        const list = names.split(',').map((s) => s.trim()).filter(Boolean);
        const idx = list.indexOf('createCodeSkill');
        if (idx === -1) return all;
        list[idx] = 'createDeclarativeCodeSkill';
        list.sort((a, b) => a.localeCompare(b));
        return 'import { ' + list.join(', ') + ' } from ' + mod + ';';
      },
    );
    text = text.replace(/(?<![A-Za-z0-9_$])createCodeSkill(?![A-Za-z0-9_$])\s*\(/g, 'createDeclarativeCodeSkill(');

    if (log.variableName) {
      const re = new RegExp(
        '\\n(?:/\\*\\*[\\s\\S]*?\\*/\\n)?(?:export\\s+)?const\\s+' + log.variableName + '\\s*=\\s*`[\\s\\S]*?`;[ \\t]*\\n',
      );
      if (re.test(text)) {
        text = text.replace(re, '\n');
        log.warnings.push('removed now-unused source constant ' + log.variableName);
      }
    }
    text = text.replace(/\n{3,}/g, '\n\n');
  }

  log.changed = changed;
  log.output = text;
  if (!changed) return log;

  if (options.stdout) process.stdout.write(text);
  else if (!options.dryRun) fs.writeFileSync(filePath, text);
  return log;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main(argv) {
  const options = { dryRun: false, stdout: false };
  const files = [];
  for (const arg of argv) {
    if (arg === '--dry-run' || arg === '-n') options.dryRun = true;
    else if (arg === '--stdout') options.stdout = true;
    else files.push(arg);
  }

  if (files.length === 0) {
    process.stderr.write('usage: node scripts/codemod-to-declarative.js [--dry-run|--stdout] <file.ts> [file.ts ...]\n');
    process.exitCode = 1;
    return;
  }

  let converted = 0;
  let failed = 0;

  for (const file of files) {
    process.stdout.write('\n' + file + '\n');
    if (!fs.existsSync(file)) {
      process.stdout.write('  ! file not found\n');
      failed += 1;
      continue;
    }
    let log;
    try {
      log = transformFile(file, options);
    } catch (err) {
      process.stdout.write('  ! failed: ' + ((err && err.message) || String(err)) + '\n');
      failed += 1;
      continue;
    }
    if (!log.changed) {
      process.stdout.write('  = no createCodeSkill call converted\n');
      for (const w of log.warnings) process.stdout.write('    ! ' + w + '\n');
      failed += 1;
      continue;
    }
    for (const call of log.calls) {
      process.stdout.write('  -> converted (persistenceEnvVar: ' + call.envVar + ')\n');
      for (const key of call.storeKeys) process.stdout.write('     store key: ' + key + '\n');
      for (const note of call.notes) process.stdout.write('     - ' + note + '\n');
    }
    for (const w of log.warnings) process.stdout.write('  ! ' + w + '\n');
    process.stdout.write('  ' + (options.dryRun ? 'dry run, file untouched' : options.stdout ? 'written to stdout' : 'file updated in place') + '\n');
    converted += 1;
  }

  process.stdout.write('\n' + converted + ' file(s) converted, ' + failed + ' skipped or failed\n');
  if (failed > 0) process.exitCode = 1;
}

main(process.argv.slice(2));
