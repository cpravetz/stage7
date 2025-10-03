import { Step, StepStatus } from '../src/agents/Step';
import { PluginParameterType } from '@cktmcs/shared';

describe('Step auto-mapping fallback', () => {
    it('auto-maps a single producer output to a differently-named consumer input and logs remap', async () => {
        const mockPersistenceManager: any = {
            logEvent: jest.fn().mockResolvedValue(undefined),
            saveWorkProduct: jest.fn().mockResolvedValue(undefined)
        };

        const producer = new Step({
            missionId: 'm1',
            actionVerb: 'GENERATE',
            stepNo: 1,
            persistenceManager: mockPersistenceManager,
            status: StepStatus.COMPLETED,
            result: [{ name: 'answer', resultType: PluginParameterType.STRING, result: 'The poem', success: true, resultDescription: 'generated answer' }]
        });

        const consumer = new Step({
            missionId: 'm1',
            actionVerb: 'FILE_OPERATION',
            stepNo: 2,
            persistenceManager: mockPersistenceManager,
            dependencies: [{ sourceStepId: producer.id, outputName: 'poem', inputName: 'content' }],
            inputValues: new Map()
        });

        const allSteps: Step[] = [producer, consumer];

        expect(consumer.areDependenciesSatisfied(allSteps)).toBe(true);

                consumer.dereferenceInputs(allSteps);

        const populated = consumer.inputValues.get('content');
        expect(populated).toBeDefined();
        expect(populated!.value).toBe('The poem');
        expect(populated!.args).toBeDefined();
    expect((populated!.args as any).auto_mapped_from).toBe('answer');

        expect(mockPersistenceManager.logEvent).toHaveBeenCalled();
        const calls = (mockPersistenceManager.logEvent as jest.Mock).mock.calls;
    const remapCall = calls.find((c: any) => c[0]?.eventType === 'dependency_auto_remap');
        expect(remapCall).toBeDefined();
        expect(remapCall[0].mappedFrom).toBe('answer');
    });
});
