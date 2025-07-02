import { Step, StepStatus, createFromPlan } from '../src/agents/Step';
import { AgentPersistenceManager } from '../src/utils/AgentPersistenceManager';
import { PluginParameterType, PluginOutput, InputValue, ActionVerbTask, InputReference } from '@cktmcs/shared';

// Mock AgentPersistenceManager
jest.mock('../../utils/AgentPersistenceManager');

describe('Step', () => {
    let mockPersistenceManager: jest.Mocked<AgentPersistenceManager>;

    beforeEach(() => {
        mockPersistenceManager = new AgentPersistenceManager() as jest.Mocked<AgentPersistenceManager>;
        // Provide default mock implementations if needed for all tests
        mockPersistenceManager.logEvent = jest.fn().mockResolvedValue(undefined);
        mockPersistenceManager.saveWorkProduct = jest.fn().mockResolvedValue(undefined);
    });

    describe('handleForeach', () => {
        const mockExecuteAction = jest.fn();
        const mockThinkAction = jest.fn();
        const mockDelegateAction = jest.fn();
        const mockAskAction = jest.fn();

        it('should return an error if "array" input is missing', async () => {
            const step = new Step({
                actionVerb: 'FOREACH',
                stepNo: 1,
                inputValues: new Map([
                    ['steps', { inputName: 'steps', value: [{ actionVerb: 'DUMMY_ACTION' }], valueType: PluginParameterType.PLAN }]
                ]),
                persistenceManager: mockPersistenceManager
            });

            // Directly call handleForeach for testing (it's private, so we cast to any)
            const result = await (step as any).handleForeach();

            expect(result[0].success).toBe(false);
            expect(result[0].error).toContain('FOREACH requires an "array" input');
            expect(result[0].resultType).toBe(PluginParameterType.ERROR);
        });

        it('should return an error if "array" input is not an array', async () => {
            const step = new Step({
                actionVerb: 'FOREACH',
                stepNo: 1,
                inputValues: new Map([
                    ['array', { inputName: 'array', value: 'not-an-array', valueType: PluginParameterType.STRING }],
                    ['steps', { inputName: 'steps', value: [{ actionVerb: 'DUMMY_ACTION' }], valueType: PluginParameterType.PLAN }]
                ]),
                persistenceManager: mockPersistenceManager
            });
            const result = await (step as any).handleForeach();
            expect(result[0].success).toBe(false);
            expect(result[0].error).toContain('FOREACH requires an "array" input of type array');
        });

        it('should return an error if "steps" input is missing', async () => {
            const step = new Step({
                actionVerb: 'FOREACH',
                stepNo: 1,
                inputValues: new Map([
                    ['array', { inputName: 'array', value: [1, 2], valueType: PluginParameterType.ARRAY }]
                ]),
                persistenceManager: mockPersistenceManager
            });
            const result = await (step as any).handleForeach();
            expect(result[0].success).toBe(false);
            expect(result[0].error).toContain('FOREACH requires a "steps" input');
        });

        it('should return an error if "steps" input is not a plan (array of tasks)', async () => {
            const step = new Step({
                actionVerb: 'FOREACH',
                stepNo: 1,
                inputValues: new Map([
                    ['array', { inputName: 'array', value: [1, 2], valueType: PluginParameterType.ARRAY }],
                    ['steps', { inputName: 'steps', value: 'not-a-plan', valueType: PluginParameterType.STRING }]
                ]),
                persistenceManager: mockPersistenceManager
            });
            const result = await (step as any).handleForeach();
            expect(result[0].success).toBe(false);
            expect(result[0].error).toContain('FOREACH requires a "steps" input of type plan');
        });

        it('should return a skip message if input array is empty', async () => {
            const step = new Step({
                actionVerb: 'FOREACH',
                stepNo: 1,
                inputValues: new Map([
                    ['array', { inputName: 'array', value: [], valueType: PluginParameterType.ARRAY }],
                    ['steps', { inputName: 'steps', value: [{ actionVerb: 'DUMMY_ACTION' }], valueType: PluginParameterType.PLAN }]
                ]),
                persistenceManager: mockPersistenceManager
            });
            const result = await (step as any).handleForeach();
            expect(result[0].success).toBe(true);
            expect(result[0].name).toBe('loop_skipped');
            expect(result[0].result).toContain('Empty array, no iterations');
        });

        it('should generate a plan with steps for each item in the array', async () => {
            const inputArray = ['apple', 'banana'];
            const subPlanTemplate: ActionVerbTask[] = [
                { actionVerb: 'PROCESS_ITEM', description: 'Process the item' }
            ];
            const step = new Step({
                actionVerb: 'FOREACH',
                stepNo: 1,
                inputValues: new Map([
                    ['array', { inputName: 'array', value: inputArray, valueType: PluginParameterType.ARRAY }],
                    ['steps', { inputName: 'steps', value: subPlanTemplate, valueType: PluginParameterType.PLAN }]
                ]),
                persistenceManager: mockPersistenceManager
            });

            const result = await (step as any).handleForeach();

            expect(result[0].success).toBe(true);
            expect(result[0].resultType).toBe(PluginParameterType.PLAN);
            const generatedPlan = result[0].result as ActionVerbTask[];
            expect(generatedPlan.length).toBe(inputArray.length * subPlanTemplate.length); // 2 items * 1 task each = 2 tasks

            // Check first item's task
            expect(generatedPlan[0].actionVerb).toBe('PROCESS_ITEM');
            expect(generatedPlan[0].description).toContain('(Item 1/2: "apple")');
            expect(generatedPlan[0].inputReferences?.get('loopItem')?.value).toBe('apple');
            expect(generatedPlan[0].inputReferences?.get('loopIndex')?.value).toBe(0);

            // Check second item's task
            expect(generatedPlan[1].actionVerb).toBe('PROCESS_ITEM');
            expect(generatedPlan[1].description).toContain('(Item 2/2: "banana")');
            expect(generatedPlan[1].inputReferences?.get('loopItem')?.value).toBe('banana');
            expect(generatedPlan[1].inputReferences?.get('loopIndex')?.value).toBe(1);
        });

        it('should correctly generate steps for a sub-plan with multiple tasks', async () => {
            const inputArray = [{ id: 1, name: 'one' }];
            const subPlanTemplate: ActionVerbTask[] = [
                { actionVerb: 'LOG_ITEM', description: 'Log the item' },
                { actionVerb: 'NOTIFY_ADMIN', description: 'Notify admin about item' }
            ];
            const step = new Step({
                actionVerb: 'FOREACH',
                stepNo: 1,
                inputValues: new Map([
                    ['array', { inputName: 'array', value: inputArray, valueType: PluginParameterType.ARRAY }],
                    ['steps', { inputName: 'steps', value: subPlanTemplate, valueType: PluginParameterType.PLAN }]
                ]),
                persistenceManager: mockPersistenceManager
            });

            const result = await (step as any).handleForeach();
            expect(result[0].success).toBe(true);
            const generatedPlan = result[0].result as ActionVerbTask[];
            expect(generatedPlan.length).toBe(inputArray.length * subPlanTemplate.length); // 1 item * 2 tasks = 2 tasks

            // Task 1 for item 1
            expect(generatedPlan[0].actionVerb).toBe('LOG_ITEM');
            expect(generatedPlan[0].description).toContain(`(Item 1/1: ${JSON.stringify(inputArray[0])})`);
            expect(generatedPlan[0].inputReferences?.get('loopItem')?.value).toEqual(inputArray[0]);
            expect(generatedPlan[0].inputReferences?.get('loopIndex')?.value).toBe(0);

            // Task 2 for item 1
            expect(generatedPlan[1].actionVerb).toBe('NOTIFY_ADMIN');
            expect(generatedPlan[1].description).toContain(`(Item 1/1: ${JSON.stringify(inputArray[0])})`);
            expect(generatedPlan[1].inputReferences?.get('loopItem')?.value).toEqual(inputArray[0]);
            expect(generatedPlan[1].inputReferences?.get('loopIndex')?.value).toBe(0);
        });

        it('should preserve existing inputReferences in sub-plan tasks', async () => {
            const inputArray = ['test'];
            const subPlanTemplate: ActionVerbTask[] = [
                {
                    actionVerb: 'USE_ITEM_AND_CONFIG',
                    description: 'Use item with config',
                    inputReferences: new Map<string, InputReference>([
                        ['configValue', { inputName: 'configValue', value: 'xyz123', valueType: PluginParameterType.STRING }]
                    ])
                }
            ];
            const step = new Step({
                actionVerb: 'FOREACH',
                stepNo: 1,
                inputValues: new Map([
                    ['array', { inputName: 'array', value: inputArray, valueType: PluginParameterType.ARRAY }],
                    ['steps', { inputName: 'steps', value: subPlanTemplate, valueType: PluginParameterType.PLAN }]
                ]),
                persistenceManager: mockPersistenceManager
            });

            const result = await (step as any).handleForeach();
            expect(result[0].success).toBe(true);
            const generatedPlan = result[0].result as ActionVerbTask[];
            expect(generatedPlan.length).toBe(1);

            const taskReferences = generatedPlan[0].inputReferences;
            expect(taskReferences?.get('loopItem')?.value).toBe('test');
            expect(taskReferences?.get('loopIndex')?.value).toBe(0);
            expect(taskReferences?.get('configValue')?.value).toBe('xyz123');
            expect(taskReferences?.get('configValue')?.valueType).toBe(PluginParameterType.STRING);
        });
    });
});
