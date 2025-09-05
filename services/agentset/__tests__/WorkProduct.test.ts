
import { WorkProduct } from '../src/utils/WorkProduct';
import { PluginOutput, PluginParameterType } from '@cktmcs/shared';

describe('WorkProduct', () => {
  it('should create a new WorkProduct with the correct properties', () => {
    const agentId = 'test-agent';
    const stepId = 'test-step';
    const data: PluginOutput[] = [
      {
        success: true,
        name: 'test-output',
        resultType: PluginParameterType.STRING,
        result: 'test-result',
        resultDescription: 'A test result',
      },
    ];

    const workProduct = new WorkProduct(agentId, stepId, data);

    expect(workProduct.agentId).toBe(agentId);
    expect(workProduct.stepId).toBe(stepId);
    expect(workProduct.data).toEqual(data);
  });
});
