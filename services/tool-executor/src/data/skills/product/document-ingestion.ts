import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

export const DOCUMENT_INGESTION = createCodeSkill({
  id: 'document-ingestion',
  name: 'Document Ingestion',
  description: 'Parse and normalize product documents, markdown specs, and requirements into structured data with section extraction, entity detection, and table row parsing.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: `const input = __tool_input || {};
const content = input.content || '';
const format = input.format || 'markdown';
const sections = [];
let currentSection = null;
for (const line of content.split('\\n')) {
  const heading = line.match(/^#+\\s+(.+)/);
  if (heading) {
    if (currentSection) sections.push(currentSection);
    currentSection = { title: heading[1], level: heading[0].length, content: [], type: 'section' };
    continue;
  }
  if (currentSection) currentSection.content.push(line);
}
if (currentSection) sections.push(currentSection);
const entities = [];
const bulletRegex = /^[-*]\\s+(.+)/;
const tableRegex = /^\\|(.+)\\|/;
for (const section of sections) {
  for (const line of section.content) {
    const match = line.match(bulletRegex);
    if (match) entities.push({ section: section.title, text: match[1], type: 'item' });
    const tableMatch = line.match(tableRegex);
    if (tableMatch) entities.push({ section: section.title, text: tableMatch[1], type: 'table-row' });
  }
}
const result = { format, sectionCount: sections.length, sections, entities, rawLength: content.length, parsedAt: new Date().toISOString() };
console.log(JSON.stringify({ success: true, data: result }));
return result;`,
  },
  inputSchema: {
    type: 'object',
    properties: {
      content: SchemaProps.text({ description: 'Document content to parse' }),
      format: SchemaProps.select(['markdown', 'yaml', 'html'], { description: 'Input format' }),
      extractSections: SchemaProps.stringArray({ description: 'Section names to extract' }),
      preserveFormatting: SchemaProps.boolean({ description: 'Preserve original formatting markers', default: true }),
    },
    required: ['content'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: { type: 'object', description: 'Parsed document structure with sections and entities' },
    },
    required: ['success', 'data'],
  },
});

DOCUMENT_INGESTION.triggers = [
  { kind: 'user', phrase_examples: ['Parse this document', 'Ingest content', 'Extract sections'] },
  { kind: 'event', on: 'Document uploaded' },
];
