import { Step, StepStatus, createFromPlan } from '../src/agents/Step';
import { AgentPersistenceManager } from '../src/utils/AgentPersistenceManager';
import { PluginParameterType, PluginOutput, InputValue, ActionVerbTask, InputReference, OutputType } from '@cktmcs/shared';

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


    describe('getOutputType', () => {
        it('should return PLAN if the step result contains a plan', () => {
            const step = new Step({
                actionVerb: 'PLAN_ACTION',
                stepNo: 1,
                persistenceManager: mockPersistenceManager,
                status: StepStatus.COMPLETED,
                result: [{ name: 'plan', resultType: PluginParameterType.PLAN, result: [], success: true, resultDescription: '' }]
            });
            const allSteps: Step[] = [step];
            expect(step.getOutputType(allSteps)).toBe(OutputType.PLAN);
        });

        it('should return FINAL if the step is an endpoint and does not generate a plan', () => {
            const step = new Step({
                actionVerb: 'FINAL_ACTION',
                stepNo: 1,
                persistenceManager: mockPersistenceManager,
                status: StepStatus.COMPLETED,
                result: [{ name: 'output', resultType: PluginParameterType.STRING, result: 'done', success: true, resultDescription: '' }]
            });
            const allSteps: Step[] = [step];
            // Mock isEndpoint to return true for this step
            jest.spyOn(step, 'isEndpoint').mockReturnValue(true);
            expect(step.getOutputType(allSteps)).toBe(OutputType.FINAL);
        });

        it('should return INTERIM if the step is not an endpoint and does not generate a plan', () => {
            const step1 = new Step({
                actionVerb: 'INTERIM_ACTION',
                stepNo: 1,
                persistenceManager: mockPersistenceManager,
                status: StepStatus.COMPLETED,
                result: [{ name: 'output', resultType: PluginParameterType.STRING, result: 'interim output', success: true, resultDescription: '' }]
            });
            const step2 = new Step({
                actionVerb: 'DEPENDENT_ACTION',
                stepNo: 2,
                persistenceManager: mockPersistenceManager,
                dependencies: [{ sourceStepId: step1.id, outputName: 'output', inputName: 'input' }]
            });
            const allSteps: Step[] = [step1, step2];
            // Mock isEndpoint for step1 to return false as step2 depends on it
            jest.spyOn(step1, 'isEndpoint').mockReturnValue(false);
            expect(step1.getOutputType(allSteps)).toBe(OutputType.INTERIM);
        });
    });

    describe('execute', () => {
        const mockExecuteAction = jest.fn();
        const mockThinkAction = jest.fn();
        const mockDelegateAction = jest.fn();
        const mockAskAction = jest.fn();

        it('should execute an IF_THEN step correctly when condition is true', async () => {
            const step = new Step({
                missionId: 'test-mission',
                actionVerb: 'IF_THEN',
                stepNo: 1,
                inputValues: new Map([
                    ['condition', { inputName: 'condition', value: true, valueType: PluginParameterType.BOOLEAN, args: {} }],
                    ['trueSteps', { inputName: 'trueSteps', value: [{ actionVerb: 'TRUE_ACTION' }], valueType: PluginParameterType.PLAN, args: {} }],
                ]),
                persistenceManager: mockPersistenceManager,
            });

            const result = await step.execute(mockExecuteAction, mockThinkAction, mockDelegateAction, mockAskAction);

            expect(result[0].success).toBe(true);
            expect(result[0].resultType).toBe(PluginParameterType.PLAN);
            const newSteps = result[0].result as any[];
            expect(newSteps[0].actionVerb).toBe('TRUE_ACTION');
        });

        it('should execute an IF_THEN step correctly when condition is false', async () => {
            const step = new Step({
                missionId: 'test-mission',
                actionVerb: 'IF_THEN',
                stepNo: 1,
                inputValues: new Map([
                    ['condition', { inputName: 'condition', value: false, valueType: PluginParameterType.BOOLEAN, args: {} }],
                    ['trueSteps', { inputName: 'trueSteps', value: [{ actionVerb: 'TRUE_ACTION' }], valueType: PluginParameterType.PLAN, args: {} }],
                    ['falseSteps', { inputName: 'falseSteps', value: [{ actionVerb: 'FALSE_ACTION' }], valueType: PluginParameterType.PLAN, args: {} }],
                ]),
                persistenceManager: mockPersistenceManager,
            });

            const result = await step.execute(mockExecuteAction, mockThinkAction, mockDelegateAction, mockAskAction);

            expect(result[0].success).toBe(true);
            expect(result[0].resultType).toBe(PluginParameterType.PLAN);
            const newSteps = result[0].result as any[];
            expect(newSteps[0].actionVerb).toBe('FALSE_ACTION');
        });

        it('should auto-map a single output from a producer when consumer expects a different output name and emit remap event', async () => {
            // Create a producer step that completed with a single output named 'answer'
            const producer = new Step({
                missionId: 'm1',
                actionVerb: 'GENERATE',
                stepNo: 1,
                persistenceManager: mockPersistenceManager,
                status: StepStatus.COMPLETED,
                result: [{ name: 'answer', resultType: PluginParameterType.STRING, result: 'The poem', success: true, resultDescription: 'generated answer' }]
            });

            // Consumer step depends on producer.outputName 'poem'
            const consumer = new Step({
                missionId: 'm1',
                actionVerb: 'FILE_OPERATION',
                stepNo: 2,
                persistenceManager: mockPersistenceManager,
                dependencies: [{ sourceStepId: producer.id, outputName: 'poem', inputName: 'content' }],
                inputValues: new Map()
            });

            const allSteps: Step[] = [producer, consumer];

            // Ensure areDependenciesSatisfied treats this as satisfied due to single producer output
            expect(consumer.areDependenciesSatisfied(allSteps)).toBe(true);

            // Populate inputs from dependencies and verify auto-mapping happened
            consumer.dereferenceInputs(allSteps);
            const populated = consumer.inputValues.get('content');
            expect(populated).toBeDefined();
            expect(populated!.value).toBe('The poem');
            expect(populated!.args).toBeDefined();
            expect(populated!.args!.auto_mapped_from).toBe('answer');

            // Verify an event was logged for dependency_auto_remap
            expect(mockPersistenceManager.logEvent).toHaveBeenCalled();
            const calls = (mockPersistenceManager.logEvent as jest.Mock).mock.calls;
            const remapCall = calls.find(c => c[0]?.eventType === 'dependency_auto_remap');
            expect(remapCall).toBeDefined();
            expect(remapCall[0].dependency).toContain(`${producer.id}.poem`);
            expect(remapCall[0].mappedFrom).toBe('answer');
        });
    });
});