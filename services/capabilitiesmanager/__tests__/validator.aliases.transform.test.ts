import { validateAndStandardizeInputs } from '../src/utils/validator';
import fs from 'fs';

describe('Validator alias mapping - TRANSFORM', () => {
  test('maps code -> script and params -> script_parameters', async () => {
    const plugin = JSON.parse(fs.readFileSync(require.resolve('../src/plugins/TRANSFORM/manifest.json'), 'utf8'));
  const provided = new Map(Object.entries({ code: { value: 'print("hello")' }, params: { value: { key: 'value' } } })) as any as Map<string, any>;
  const result = await validateAndStandardizeInputs(plugin, provided as any);
  expect(result.success).toBeTruthy();
  const map = result.inputs as Map<string, any>;
  expect(map.has('script')).toBeTruthy();
  expect(map.has('script_parameters')).toBeTruthy();
  });
});
