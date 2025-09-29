import { validateAndStandardizeInputs } from '../src/utils/validator';
import fs from 'fs';

// Smoke tests for alias mapping

describe('Validator alias mapping - FILE_OPS_PYTHON', () => {
  test('maps filePath -> path', async () => {
    const plugin = JSON.parse(fs.readFileSync(require.resolve('../src/plugins/FILE_OPS_PYTHON/manifest.json'), 'utf8'));
  const provided = new Map(Object.entries({ filePath: { value: 'notes/steeler_poem.txt' }, operation: { value: 'read' } })) as any as Map<string, any>;
  const result = await validateAndStandardizeInputs(plugin, provided as any);
  expect(result.success).toBeTruthy();
  const map = result.inputs as Map<string, any>;
  expect(map.has('path')).toBeTruthy();
  const v = map.get('path');
  expect(v.originalName === 'filePath' || v.inputName === 'path').toBeTruthy();
  });
});
