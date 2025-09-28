import { validateAndStandardizeInputs } from '../src/utils/validator';

// Minimal PluginDefinition stub matching FILE_OPS_PYTHON manifest
const fileOpsPlugin = {
  verb: 'FILE_OPERATION',
  inputDefinitions: [
    { name: 'path', required: false, type: 'string', aliases: ['filePath','fileName'] },
    { name: 'fileId', required: false, type: 'string', aliases: ['file_id','id'] },
    { name: 'operation', required: true, type: 'string' },
    { name: 'content', required: false, type: 'string', aliases: ['body','text'] }
  ]
};

(async () => {
  const providedInputs = new Map();
  providedInputs.set('filePath', { inputName: 'filePath', value: 'notes/steeler_poem.txt', valueType: 'string', args: {} });
  providedInputs.set('operation', { inputName: 'operation', value: 'write', valueType: 'string', args: {} });
  providedInputs.set('content', { inputName: 'content', value: 'hello world', valueType: 'string', args: {} });

  const result = await validateAndStandardizeInputs(fileOpsPlugin as any, providedInputs as any);
  console.log('Validation result:', result);

  if (!result.success) {
    console.error('Test FAILED: validation did not succeed', result.error);
    process.exit(2);
  }

  const inputsMap = result.inputs as Map<string, any>;
  if (inputsMap.has('path')) {
    console.log('Test PASSED: filePath correctly mapped to path ->', inputsMap.get('path'));
    process.exit(0);
  } else {
    console.error('Test FAILED: path not found in standardized inputs', Array.from(inputsMap.keys()));
    process.exit(2);
  }
})();