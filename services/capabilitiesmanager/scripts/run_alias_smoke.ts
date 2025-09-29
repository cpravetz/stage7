import { validateAndStandardizeInputs } from '../src/utils/validator';
import fs from 'fs';

async function run() {
  try {
    const fileOps = JSON.parse(fs.readFileSync(require.resolve('../src/plugins/FILE_OPS_PYTHON/manifest.json'), 'utf8'));
  const provided1 = new Map(Object.entries({ filePath: { value: 'notes/steeler_poem.txt' }, operation: { value: 'read' } })) as any as Map<string, any>;
  const r1 = await validateAndStandardizeInputs(fileOps, provided1 as any);
  console.log('FILE_OPS raw result:', r1);
  if (r1.inputs) console.log('FILE_OPS mapping success?', r1.success, Array.from((r1.inputs as Map<string, any>).entries()));
  else console.log('FILE_OPS mapping failed or returned no inputs.');

    const transform = JSON.parse(fs.readFileSync(require.resolve('../src/plugins/TRANSFORM/manifest.json'), 'utf8'));
  const provided2 = new Map(Object.entries({ code: { value: 'print("hello")' }, params: { value: { key: 'value' } } })) as any as Map<string, any>;
  const r2 = await validateAndStandardizeInputs(transform, provided2 as any);
  console.log('TRANSFORM raw result:', r2);
  if (r2.inputs) console.log('TRANSFORM mapping success?', r2.success, Array.from((r2.inputs as Map<string, any>).entries()));
  else console.log('TRANSFORM mapping failed or returned no inputs.');
  } catch (e) {
    console.error('Error running smoke:', e);
    process.exit(1);
  }
}

run();
