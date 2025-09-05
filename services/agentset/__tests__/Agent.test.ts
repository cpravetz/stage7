// services/agentset/__tests__/Agent.test.ts
import { Agent, CollaborationMessageType, ConflictResolution, CoordinationType, ResourceResponse, TaskUpdatePayload, CoordinationData } from '../src/agents/Agent';
import { AgentConfig, OutputType } from '@cktmcs/shared';
import { Step, StepStatus, StepModification } from '../src/agents/Step';
import { AgentPersistenceManager } from '../src/utils/AgentPersistenceManager';
import { StateManager } from '../src/utils/StateManager';
import { getServiceUrls } from '../src/utils/postOfficeInterface';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios'; // Keep the import for type annotations if needed elsewhere

// Mock external dependencies
// jest.mock('axios'); // This will be replaced by the factory mock below

const mockAxiosInstance = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  patch: jest.fn(),
  head: jest.fn(),
  options: jest.fn(),
  request: jest.fn(),
  defaults: { headers: { common: {}, delete: {}, get: {}, head: {}, post: {}, put: {}, patch: {} } } as any, // More complete defaults
  interceptors: {
    request: { use: jest.fn(), eject: jest.fn() },
    response: { use: jest.fn(), eject: jest.fn() },
  },
  getUri: jest.fn(),
};

jest.mock('axios', () => ({
  ...jest.requireActual('axios'), // Use actual for other things like isAxiosError if not explicitly mocked
  create: jest.fn(() => mockAxiosInstance),
  isAxiosError: jest.fn((payload) => payload && payload.isAxiosError === true), // Mock isAxiosError
  // Mock other static axios methods if used (e.g., get, post) directly on axios, not instance
  get: jest.fn(),
  post: jest.fn(),
}));

jest.mock('../src/utils/postOfficeInterface');
jest.mock('../src/utils/AgentPersistenceManager');
jest.mock('../src/utils/StateManager');
jest.mock('../src/agents/Step'); // Mock the Step class


const mockGetSvcUrls = getServiceUrls as jest.MockedFunction<typeof getServiceUrls>;
const MockStep = Step as jest.MockedClass<typeof Step>;
// mockAxios will now be the mocked version from jest.mock
const mockAxios = axios as jest.Mocked<typeof axios>;
const mockUuidv4 = uuidv4 as jest.MockedFunction<typeof uuidv4>;


// Default minimal config for agent instantiation
const createMockAgentConfig = (id = mockUuidv4(), overrides: Partial<AgentConfig> = {}): AgentConfig => ({
    id,
    missionId: 'test-mission',
    actionVerb: 'TEST_VERB',
    inputs: new Map(),
    agentSetUrl: 'http://localhost:9001', // Mock agentSetUrl
    dependencies: [],
    ...overrides,
});

describe('Agent', () => {
    let agent: Agent;
    let mockConfig: AgentConfig;
    let mockLogEvent: jest.SpyInstance; // To spy on agent.logEvent

    beforeEach(() => {
        // Reset mocks before each test
        mockAxiosInstance.get.mockClear();
        mockAxiosInstance.post.mockClear();
        mockAxiosInstance.put.mockClear();
        mockAxiosInstance.delete.mockClear();
        // ... clear other mockAxiosInstance methods ...
        mockAxiosInstance.interceptors.request.use.mockClear();
        mockAxiosInstance.interceptors.response.use.mockClear();

        (axios.create as jest.Mock).mockClear().mockReturnValue(mockAxiosInstance);
        (axios.get as jest.Mock).mockClear();
        (axios.post as jest.Mock).mockClear();
        (axios.isAxiosError as jest.Mock).mockClear().mockImplementation((payload) => payload && payload.isAxiosError === true);


        mockGetSvcUrls.mockResolvedValue({
            capabilitiesManagerUrl: 'http://localhost:9002',
            brainUrl: 'http://localhost:9003',
            trafficManagerUrl: 'http://localhost:9004',
            librarianUrl: 'http://localhost:9005',
        });

        // Ensure AgentPersistenceManager and StateManager mocks are clean and provide basic functionality
        (AgentPersistenceManager as jest.Mock).mockImplementation(() => ({
            logEvent: jest.fn().mockResolvedValue(undefined),
            loadWorkProduct: jest.fn().mockResolvedValue(null),
            saveWorkProduct: jest.fn().mockResolvedValue(undefined),
        }));
        (StateManager as jest.Mock).mockImplementation(() => ({
            saveState: jest.fn().mockResolvedValue(undefined),
            loadState: jest.fn().mockResolvedValue(null),
            applyState: jest.fn().mockResolvedValue(undefined),
        }));


        // Mock Step instance methods that might be called indirectly
        // We need to mock the constructor of Step to return instances that have mocked methods
        MockStep.mockImplementation((options: any) => {
            const mockStepInstance = {
                ...options, // spread options to retain id, actionVerb etc.
                id: options.id || mockUuidv4(),
                status: options.status || StepStatus.PENDING,
                inputs: options.inputs || new Map(),
                dependencies: options.dependencies || [],
                stepNo: options.stepNo || 1,
                description: options.description || 'mock step',
                areDependenciesSatisfied: jest.fn().mockReturnValue(true),
                execute: jest.fn().mockResolvedValue([]),
                applyModifications: jest.fn(),
                clearTempData: jest.fn(),
                isEndpoint: jest.fn().mockReturnValue(false), // Default mock
                getOutputType: jest.fn().mockReturnValue(OutputType.INTERIM), // Default mock
                persistenceManager: new AgentPersistenceManager(),
                awaitsSignal: undefined,
            } as unknown as Step;
            return mockStepInstance;
        });


        mockConfig = createMockAgentConfig();
        // @ts-ignore // BaseEntity constructor expects different params, simplify for test
        agent = new Agent(mockConfig);
        // agent.authenticatedApi is initialized within BaseEntity's constructor,
        // which calls new AuthenticatedApiClient(), which calls createAuthenticatedAxios(),
        // which calls axios.create(). So agent.authenticatedApi should be the mockAxiosInstance.
        // We can verify this or just ensure the mock setup is correct.
        // Forcing it here as well for safety, though ideally the constructor chain handles it.
        agent.authenticatedApi = mockAxiosInstance as any;

        // Spy on agent.logEvent AFTER agent instantiation
        mockLogEvent = jest.spyOn(agent, 'logEvent').mockImplementation(async () => {});


        // Suppress console.log/warn/error during tests to keep output clean
        // jest.spyOn(console, 'log').mockImplementation(() => {});
        // jest.spyOn(console, 'warn').mockImplementation(() => {});
        // jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(agent, 'say').mockImplementation(() => {});
        jest.spyOn(agent, 'notifyTrafficManager').mockImplementation(async () => {});
        jest.spyOn(agent, 'saveAgentState').mockImplementation(async () => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('constructor & initialization', () => {
        it('should initialize with default resources', () => {
            expect(agent.manageableResources).toEqual(['COMPUTE_TIME', 'DATABASE_ACCESS', 'API_QUOTA_X']);
            expect(agent.availableResources.get('COMPUTE_TIME')).toBe(100);
            expect(agent.pendingResourceRequests).toBeInstanceOf(Map);
            expect(agent.pendingResourceRequests.size).toBe(0);
            expect(agent.steps.length).toBe(1); // Initial step
        });
    });

    describe('handleCollaborationMessage', () => {
        let mockStep: Step;

        beforeEach(() => {
            // Create a spy for processResourceRequest on the specific agent instance
            jest.spyOn(agent, 'processResourceRequest').mockImplementation(async () => ({
                requestId: 'mockProcessedId', granted: true, resource: 'mockResource' // provide a default mock implementation
            }));

            // Add a mock step to the agent for TASK_UPDATE tests
            // Retrieve the mocked constructor for Step
            const MockStepCtor = Step as jest.MockedClass<typeof Step>;
            // Ensure a persistenceManager is passed if the Step constructor expects it
            const mockPersistenceManager = new AgentPersistenceManager() as jest.Mocked<AgentPersistenceManager>;
            mockStep = new MockStepCtor({ id: 'step1', actionVerb: 'EXISTING_STEP', persistenceManager: mockPersistenceManager });
            agent.steps = [mockStep];
        });

        it('should log and process TASK_UPDATE correctly', async () => {
            const payload: TaskUpdatePayload = {
                stepId: 'step1',
                status: StepStatus.COMPLETED,
                description: 'New description',
                updateInputs: { 'newInput': { inputName: 'newInput', inputValue: 'newValue', args: {} } }
            };
            const message = { type: CollaborationMessageType.TASK_UPDATE, payload, senderId: 'senderAgent', timestamp: new Date().toISOString() };

            await agent.handleCollaborationMessage(message);

            expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'collaboration_task_updated' }));
            expect(mockStep.status).toBe(StepStatus.COMPLETED);
            expect(mockStep.description).toBe('New description');
            expect(mockStep.inputs.get('newInput')?.inputValue).toBe('newValue');
            expect(agent.notifyTrafficManager).toHaveBeenCalled();
            expect(agent.saveAgentState).toHaveBeenCalled();
        });

        it('should replace inputs for TASK_UPDATE if newInputs is provided', async () => {
            const payload: TaskUpdatePayload = {
                stepId: 'step1',
                newInputs: { 'brandNewInput': { inputName: 'brandNewInput', inputValue: 'brandNewValue', args: {} } }
            };
            const message = { type: CollaborationMessageType.TASK_UPDATE, payload, senderId: 'senderAgent', timestamp: new Date().toISOString() };

            mockStep.inputs = new Map([['oldInput', {inputName: 'oldInput', inputValue: 'oldValue', args: {}}]]);

            await agent.handleCollaborationMessage(message);

            expect(mockStep.inputs.size).toBe(1);
            expect(mockStep.inputs.get('brandNewInput')?.inputValue).toBe('brandNewValue');
            expect(mockStep.inputs.size).toBe(1);
            expect(mockStep.inputs.get('brandNewInput')?.inputValue).toBe('brandNewValue');
            expect(mockStep.inputs.has('oldInput')).toBe(false);
        });

        it('should update only step status for TASK_UPDATE', async () => {
            const payload: TaskUpdatePayload = { stepId: 'step1', status: StepStatus.RUNNING };
            const message = { type: CollaborationMessageType.TASK_UPDATE, payload, senderId: 'senderAgent', timestamp: new Date().toISOString() };
            const originalDescription = mockStep.description;

            await agent.handleCollaborationMessage(message);
            expect(mockStep.status).toBe(StepStatus.RUNNING);
            expect(mockStep.description).toBe(originalDescription); // Description should not change
            expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'collaboration_task_updated' }));
            expect(agent.notifyTrafficManager).toHaveBeenCalled();
            expect(agent.saveAgentState).toHaveBeenCalled();
        });

        it('should update only step description for TASK_UPDATE', async () => {
            const payload: TaskUpdatePayload = { stepId: 'step1', description: 'Updated Description Only' };
            const message = { type: CollaborationMessageType.TASK_UPDATE, payload, senderId: 'senderAgent', timestamp: new Date().toISOString() };
            const originalStatus = mockStep.status;

            await agent.handleCollaborationMessage(message);
            expect(mockStep.description).toBe('Updated Description Only');
            expect(mockStep.status).toBe(originalStatus); // Status should not change
            expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'collaboration_task_updated' }));
        });

        it('should merge inputs for TASK_UPDATE when updateInputs is provided', async () => {
            mockStep.inputs = new Map([
                ['existingInput', { inputName: 'existingInput', inputValue: 'initialValue', args: {} }],
                ['toBeUpdated', { inputName: 'toBeUpdated', inputValue: 'old', args: {} }]
            ]);
            const payload: TaskUpdatePayload = {
                stepId: 'step1',
                updateInputs: {
                    'newInput': { inputName: 'newInput', inputValue: 'newValue', args: {} },
                    'toBeUpdated': { inputName: 'toBeUpdated', inputValue: 'updatedValue', args: {} }
                }
            };
            const message = { type: CollaborationMessageType.TASK_UPDATE, payload, senderId: 'senderAgent', timestamp: new Date().toISOString() };

            await agent.handleCollaborationMessage(message);

            expect(mockStep.inputs.size).toBe(3);
            expect(mockStep.inputs.get('existingInput')?.inputValue).toBe('initialValue');
            expect(mockStep.inputs.get('newInput')?.inputValue).toBe('newValue');
            expect(mockStep.inputs.get('toBeUpdated')?.inputValue).toBe('updatedValue');
            expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'collaboration_task_updated' }));
        });

        it('should log and process INFO_SHARE correctly', async () => {
            const infoPayload = { info: 'some crucial data', dataPoint: 42 };
            const message = { type: CollaborationMessageType.INFO_SHARE, payload: infoPayload, senderId: 'senderAgent', timestamp: new Date().toISOString() };

            await agent.handleCollaborationMessage(message);

            expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'info_share_received' }));
            expect(agent.conversation).toContainEqual({
                role: `info_share_from_${message.senderId}`,
                content: JSON.stringify(infoPayload)
            });
        });

        it('should call processResourceRequest for RESOURCE_SHARE_REQUEST', async () => {
            const resourcePayload = { id: 'req123', resource: 'COMPUTE_TIME', amount: 10 };
            const message = { type: CollaborationMessageType.RESOURCE_SHARE_REQUEST, payload: resourcePayload, senderId: 'senderAgent', timestamp: new Date().toISOString() };

            await agent.handleCollaborationMessage(message);

            expect(agent.processResourceRequest).toHaveBeenCalledWith(resourcePayload);
        });

        it('should correctly pass allStepsForMission to getStatistics in saveWorkProductWithClassification', async () => {
            const mockStep = agent.steps[0];
            // Ensure getOutputType is called with the correct arguments
            const getOutputTypeSpy = jest.spyOn(mockStep, 'getOutputType');

            // Mock isStepFinal to control its return value
            const isStepFinalSpy = jest.spyOn(Agent as any, 'isStepFinal').mockReturnValue(true);

            const mockData = [{ success: true, name: 'output', resultType: PluginParameterType.STRING, result: 'test', resultDescription: 'Test Output' }];
            await (agent as any).saveWorkProductWithClassification(mockStep.id, mockData, true, [agent]);

            // Verify that getOutputType on the step was called with the agent's own steps
            expect(getOutputTypeSpy).toHaveBeenCalledWith(agent.steps);

            // Verify that the 'type' sent in the message is 'Final' because isStepFinal (global) and getOutputType (local) say so
            expect((agent as any).sendMessage).toHaveBeenCalledWith(
                expect.anything(), // messageType
                expect.anything(), // recipient
                expect.objectContaining({ type: 'Final' }) // payload
            );

            isStepFinalSpy.mockRestore();
            getOutputTypeSpy.mockRestore();
        });

        it('should handle invalid RESOURCE_SHARE_REQUEST payload gracefully (e.g. missing resource)', async () => {
            const invalidPayload = { id: 'req123' } as any; // Missing 'resource'
            const message = { type: CollaborationMessageType.RESOURCE_SHARE_REQUEST, payload: invalidPayload, senderId: 'senderAgent', timestamp: new Date().toISOString() };

            await agent.handleCollaborationMessage(message);
            // It should log a warning/error and not proceed to call processResourceRequest with bad data
            expect(agent.processResourceRequest).not.toHaveBeenCalled();
            expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({
                 eventType: 'collaboration_resource_request_payload_error',
                 error: 'Incompatible payload for RESOURCE_SHARE_REQUEST',
                 payload: invalidPayload
            }));
        });

        it('should log error for malformed collaboration message (missing type)', async () => {
            const malformedMessage = { payload: {}, senderId: 'senderAgent', timestamp: new Date().toISOString() };
            // @ts-ignore // Deliberately sending malformed message
            await agent.handleCollaborationMessage(malformedMessage);
             expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({
                eventType: 'unrecognized_collaboration_message',
            }));
        });

        it('should log warning for unrecognized collaboration message type', async () => {
            const message = { type: 'UNKNOWN_TYPE', payload: {}, senderId: 'senderAgent', timestamp: new Date().toISOString() };
            // @ts-ignore // Deliberately sending unknown type
            await agent.handleCollaborationMessage(message);
             expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({
                eventType: 'unrecognized_collaboration_message',
                messageType: 'UNKNOWN_TYPE'
            }));
        });

        it('should not update if TASK_UPDATE payload has no updatable fields', async () => {
            const payload: TaskUpdatePayload = { stepId: 'step1' }; // No actual updates
            const message = { type: CollaborationMessageType.TASK_UPDATE, payload, senderId: 'senderAgent', timestamp: new Date().toISOString() };

            const originalStatus = mockStep.status;
            const originalDescription = mockStep.description;

            await agent.handleCollaborationMessage(message);

            expect(mockStep.status).toBe(originalStatus);
            expect(mockStep.description).toBe(originalDescription);
            expect(agent.notifyTrafficManager).not.toHaveBeenCalled();
            expect(agent.saveAgentState).not.toHaveBeenCalled();
             expect(mockLogEvent).not.toHaveBeenCalledWith(expect.objectContaining({ eventType: 'collaboration_task_updated' }));
        });

        it('should log error if TASK_UPDATE is for a non-existent stepId', async () => {
            const payload: TaskUpdatePayload = { stepId: 'nonExistentStep', status: StepStatus.CANCELLED };
            const message = { type: CollaborationMessageType.TASK_UPDATE, payload, senderId: 'senderAgent', timestamp: new Date().toISOString() };

            await agent.handleCollaborationMessage(message);

            expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({
                eventType: 'collaboration_task_update_error',
                error: 'StepId not found for TASK_UPDATE',
                stepId: 'nonExistentStep'
            }));
        });
    });

    describe('processConflictResolution', () => {
        let step1: Step, step2: Step;
        const mockPersistenceManager = new AgentPersistenceManager() as jest.Mocked<AgentPersistenceManager>;
        const MockStepCtor = Step as jest.MockedClass<typeof Step>;

        beforeEach(() => {
            step1 = new MockStepCtor({ id: 's1', actionVerb: 'VERB_1', status: StepStatus.RUNNING, stepNo: 1, persistenceManager: mockPersistenceManager });
            step2 = new MockStepCtor({ id: 's2', actionVerb: 'VERB_2', status: StepStatus.PENDING, stepNo: 2, persistenceManager: mockPersistenceManager, dependencies: [{ sourceStepId: 's1', inputName: 'in', outputName: 'out' }] });
            agent.steps = [step1, step2];
        });

        it('should handle MODIFY_STEP correctly', async () => {
            const modifications: StepModification = { description: 'Modified Desc', inputs: { newInput: { inputName: 'newInput', inputValue: 'modValue', args: {} } } };
            const resolution: ConflictResolution = {
                chosenAction: 'MODIFY_STEP',
                resolvedStepId: 's1',
                stepModifications: modifications,
                reasoning: 'test modify'
            };

            await agent.processConflictResolution(resolution);

            expect(step1.applyModifications).toHaveBeenCalledWith(modifications);
            expect(step1.status).toBe(StepStatus.PENDING);
            expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'conflict_step_modified', stepId: 's1' }));
            expect(agent.notifyTrafficManager).toHaveBeenCalled();
            expect(agent.saveAgentState).toHaveBeenCalled();
        });

        it('should log error if MODIFY_STEP is for a non-existent stepId', async () => {
            const resolution: ConflictResolution = { chosenAction: 'MODIFY_STEP', resolvedStepId: 'nonExistent', stepModifications: {} };
            await agent.processConflictResolution(resolution);
            expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'conflict_resolution_error', error: 'Step not found for MODIFY_STEP' }));
        });

        it('should handle invalid MODIFY_STEP payload (missing stepModifications)', async () => {
            const resolution: ConflictResolution = { chosenAction: 'MODIFY_STEP', resolvedStepId: 's1' };
             // @ts-ignore // Testing invalid payload
            await agent.processConflictResolution(resolution);
            expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({
                eventType: 'conflict_resolution_error',
                error: 'Missing data for MODIFY_STEP'
            }));
        });

        it('should handle REPLACE_PLAN correctly', async () => {
            step1.status = StepStatus.COMPLETED; // Keep this one
            step2.status = StepStatus.RUNNING; // This should be removed

            const newPlanTasks: ActionVerbTask[] = [
                { actionVerb: 'NEW_VERB_1', inputs: {}, description: 'New task 1', dependencies: [] },
                { actionVerb: 'NEW_VERB_2', inputs: {}, description: 'New task 2', dependencies: [] },
            ];
            const resolution: ConflictResolution = { chosenAction: 'REPLACE_PLAN', newPlan: newPlanTasks, reasoning: 'test replace' };

            // Mock createFromPlan to track calls without relying on its internal logic here
            const mockCreateFromPlan = jest.requireActual('../src/agents/Step').createFromPlan;
            const createFromPlanSpy = jest.fn((plan, startNo, pManager) => mockCreateFromPlan(plan, startNo, pManager));
            jest.mock('../src/agents/Step', () => ({
                ...jest.requireActual('../src/agents/Step'), // Import and retain actual StepStatus etc.
                createFromPlan: (plan: ActionVerbTask[], startNo: number, pManager: AgentPersistenceManager) => createFromPlanSpy(plan, startNo, pManager),
            }));


            await agent.processConflictResolution(resolution);

            expect(agent.steps.length).toBe(1 + newPlanTasks.length); // step1 (COMPLETED) + new tasks
            expect(agent.steps[0].id).toBe('s1');
            expect(agent.steps[1].actionVerb).toBe('NEW_VERB_1');
            expect(agent.status).toBe(AgentStatus.RUNNING);
            expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'conflict_plan_replaced' }));
            expect(agent.notifyTrafficManager).toHaveBeenCalled();
            createFromPlanSpy.mockRestore(); // Clean up spy
        });


        it('should handle RETRY_STEP correctly', async () => {
            step1.status = StepStatus.ERROR;
            const resolution: ConflictResolution = { chosenAction: 'RETRY_STEP', resolvedStepId: 's1', reasoning: 'test retry' };
            await agent.processConflictResolution(resolution);

            expect(step1.status).toBe(StepStatus.PENDING);
            expect(step1.clearTempData).toHaveBeenCalled();
            expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'conflict_step_retry', stepId: 's1' }));
            expect(agent.notifyTrafficManager).toHaveBeenCalled();
        });

        it('should log error if RETRY_STEP is for a non-existent stepId', async () => {
            const resolution: ConflictResolution = { chosenAction: 'RETRY_STEP', resolvedStepId: 'nonExistent' };
            await agent.processConflictResolution(resolution);
            expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'conflict_resolution_error', error: 'Step not found for RETRY_STEP' }));
        });

        it('should handle NO_CHANGE and resume a PAUSED agent', async () => {
            agent.status = AgentStatus.PAUSED;
            const resolution: ConflictResolution = { chosenAction: 'NO_CHANGE', reasoning: 'test no change' };
            await agent.processConflictResolution(resolution);

            expect(agent.status).toBe(AgentStatus.RUNNING);
            expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'conflict_no_change' }));
        });

        it('should handle NO_CHANGE for an agent with all steps completed/errored', async () => {
            step1.status = StepStatus.COMPLETED;
            step2.status = StepStatus.ERROR;
            agent.status = AgentStatus.RUNNING; // Agent might be running but stuck
            const resolution: ConflictResolution = { chosenAction: 'NO_CHANGE', reasoning: 'test no change, stuck' };
            await agent.processConflictResolution(resolution);

            expect(agent.status).toBe(AgentStatus.RUNNING); // Should remain/be set to RUNNING
            expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'conflict_no_change' }));
        });

        it('should handle malformed resolution object (missing chosenAction)', async () => {
            // @ts-ignore // Testing invalid payload
            const resolution: Partial<ConflictResolution> = { reasoning: 'test malformed' };
            await agent.processConflictResolution(resolution as ConflictResolution);
            expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'conflict_resolution_error', error: 'Malformed resolution data' }));
        });
    });

    describe('handleCoordination', () => {
        let mockSendMessage: jest.SpyInstance;
        const mockPersistenceManager = new AgentPersistenceManager() as jest.Mocked<AgentPersistenceManager>;
        const MockStepCtor = Step as jest.MockedClass<typeof Step>;

        beforeEach(() => {
            mockSendMessage = jest.spyOn(agent, 'sendMessage').mockResolvedValue(undefined);
            agent.sharedKnowledge = new Map<string, any>(); // Reset shared knowledge
        });

        describe('SYNC_STATE', () => {
            it('should update sharedKnowledge when receiving sharedState', async () => {
                const sharedData = { key1: 'value1', knowledgePiece: { detail: 'info' } };
                const coordination: CoordinationData = {
                    type: CoordinationType.SYNC_STATE,
                    senderId: 'senderAgent',
                    payload: { sharedState: sharedData },
                    timestamp: new Date().toISOString()
                };
                await agent.handleCoordination(coordination);
                expect(agent.sharedKnowledge.get('key1')).toBe('value1');
                expect(agent.sharedKnowledge.get('knowledgePiece')).toEqual({ detail: 'info' });
                expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'coordination_shared_state_received' }));
            });

            it('should send requested state keys using sendMessage', async () => {
                agent.status = AgentStatus.RUNNING;
                agent.role = 'testRole';
                agent.sharedKnowledge.set('externalKey', 'externalValue');
                const requestedKeys = ['status', 'role', 'externalKey', 'nonExistentKey'];
                const coordination: CoordinationData = {
                    type: CoordinationType.SYNC_STATE,
                    senderId: 'requestingAgent',
                    payload: { requestedStateKeys },
                    signalId: 'syncReq1',
                    timestamp: new Date().toISOString()
                };

                await agent.handleCoordination(coordination);

                expect(mockSendMessage).toHaveBeenCalledWith(
                    MessageType.COORDINATION_MESSAGE,
                    'requestingAgent',
                    expect.objectContaining({
                        coordinationType: 'SYNC_STATE_RESPONSE',
                        originalSignalId: 'syncReq1',
                        senderAgentId: agent.id,
                        data: {
                            status: AgentStatus.RUNNING,
                            role: 'testRole',
                            externalKey: 'externalValue',
                            nonExistentKey: null
                        }
                    })
                );
                expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'coordination_sync_state_sent' }));
            });
        });

        describe('AWAIT_SIGNAL', () => {
            let step1: Step, step2: Step;

            beforeEach(() => {
                step1 = new MockStepCtor({ id: 's1', actionVerb: 'AWAIT_VERB_1', status: StepStatus.PAUSED, awaitsSignal: 'sig123', persistenceManager: mockPersistenceManager });
                step2 = new MockStepCtor({ id: 's2', actionVerb: 'AWAIT_VERB_2', status: StepStatus.PENDING, awaitsSignal: 'sig456', persistenceManager: mockPersistenceManager });
                agent.steps = [step1, step2];
            });

            it('should unpause a step when its awaited signal is received', async () => {
                const coordination: CoordinationData = {
                    type: CoordinationType.AWAIT_SIGNAL,
                    senderId: 'signalingAgent',
                    signalId: 'sig123',
                    payload: { signalReceived: true, signalId: 'sig123' },
                    timestamp: new Date().toISOString()
                };
                await agent.handleCoordination(coordination);
                expect(step1.status).toBe(StepStatus.PENDING);
                expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'step_unpaused_by_signal', stepId: 's1' }));
                expect(agent.notifyTrafficManager).toHaveBeenCalled();
            });

            it('should unpause multiple steps awaiting the same signal', async () => {
                const step3 = new MockStepCtor({ id: 's3', actionVerb: 'AWAIT_VERB_3', status: StepStatus.PAUSED, awaitsSignal: 'sig123', persistenceManager: mockPersistenceManager });
                agent.steps.push(step3);

                const coordination: CoordinationData = {
                    type: CoordinationType.AWAIT_SIGNAL,
                    senderId: 'signalingAgent',
                    signalId: 'sig123',
                    payload: { signalReceived: true, signalId: 'sig123' },
                    timestamp: new Date().toISOString()
                };
                await agent.handleCoordination(coordination);
                expect(step1.status).toBe(StepStatus.PENDING);
                expect(step3.status).toBe(StepStatus.PENDING);
                expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'step_unpaused_by_signal', stepId: 's1' }));
                expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'step_unpaused_by_signal', stepId: 's3' }));
                expect(agent.notifyTrafficManager).toHaveBeenCalledTimes(1); // Should be called once even if multiple steps unpaused
            });

            it('should not change step status if signal is not for it or step not PAUSED', async () => {
                 const originalStep2status = step2.status;
                const coordination: CoordinationData = {
                    type: CoordinationType.AWAIT_SIGNAL,
                    senderId: 'signalingAgent',
                    signalId: 'sig_other', // Different signal
                    payload: { signalReceived: true, signalId: 'sig_other' },
                    timestamp: new Date().toISOString()
                };
                await agent.handleCoordination(coordination);
                expect(step1.status).toBe(StepStatus.PAUSED); // s1 was waiting for sig123
                expect(step2.status).toBe(originalStep2status); // s2 was not PAUSED
                expect(agent.notifyTrafficManager).not.toHaveBeenCalled();
            });

            it('should log if AWAIT_SIGNAL is received (not the signal itself)', async () => {
                const coordination: CoordinationData = {
                    type: CoordinationType.AWAIT_SIGNAL,
                    senderId: 'controller',
                    signalId: 'sig123', // step1 is configured for this
                    timestamp: new Date().toISOString()
                };
                // Mock step1 to be PENDING to test the specific log path
                (step1 as any).status = StepStatus.PENDING;

                await agent.handleCoordination(coordination);
                 expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({
                    eventType: 'coordination_await_signal_processed',
                    payload: undefined // No signalReceived in payload
                }));
                // Check console output for specific message (more brittle, but for specific log)
                 // This requires console.log not to be mocked for this test, or a more specific spy.
            });
        });

        describe('PROVIDE_INFO', () => {
            it('should send requested info using sendMessage, including sharedKnowledge', async () => {
                agent.status = AgentStatus.COMPLETED;
                agent.sharedKnowledge.set('customData', { value: 123 });
                const infoKeys = ['status', 'customData', 'nonExistent'];
                const coordination: CoordinationData = {
                    type: CoordinationType.PROVIDE_INFO,
                    senderId: 'infoRequester',
                    infoKeys,
                    signalId: 'infoReq1',
                    timestamp: new Date().toISOString()
                };
                await agent.handleCoordination(coordination);
                expect(mockSendMessage).toHaveBeenCalledWith(
                    MessageType.COORDINATION_MESSAGE,
                    'infoRequester',
                    expect.objectContaining({
                        coordinationType: 'PROVIDE_INFO_RESPONSE',
                        originalSignalId: 'infoReq1',
                        senderAgentId: agent.id,
                        data: {
                            status: AgentStatus.COMPLETED,
                            customData: { value: 123 },
                            nonExistent: `Information for key 'nonExistent' not readily available or not implemented.`
                        }
                    })
                );
                expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'coordination_provide_info_sent' }));
            });
        });

        it('should handle malformed coordination data (missing type)', async () => {
            const malformedCoordination = { senderId: 'sender', timestamp: new Date().toISOString() } as any;
            await agent.handleCoordination(malformedCoordination);
            expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({
                eventType: 'coordination_error',
                error: 'Malformed coordination data'
            }));
        });
    });

    describe('processResourceRequest', () => {
        beforeEach(() => {
            // Reset resources for each test
            agent.manageableResources = ['CPU', 'RAM'];
            agent.availableResources = new Map([['CPU', 50], ['RAM', 1024]]);
        });

        it('should grant request if resource is managed and available', async () => {
            const request = { id: 'req1', resource: 'CPU', amount: 10 };
            const response = await agent.processResourceRequest(request);
            expect(response.granted).toBe(true);
            expect(response.requestId).toBe('req1');
            expect(response.resource).toBe('CPU');
            expect(response.message).toContain('granted. Remaining: 40');
            expect(agent.availableResources.get('CPU')).toBe(40);
            expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'resource_request_granted', amountGranted: 10 }));
        });

        it('should use default amount = 1 if not specified and grant', async () => {
            const request = { id: 'req2', resource: 'RAM' }; // amount not specified
            const response = await agent.processResourceRequest(request);
            expect(response.granted).toBe(true);
            expect(response.message).toContain('granted. Remaining: 1023');
            expect(agent.availableResources.get('RAM')).toBe(1023);
            expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'resource_request_granted', amountGranted: 1 }));
        });

        it('should deny if resource is not in manageableResources', async () => {
            const request = { id: 'req3', resource: 'GPU', amount: 1 };
            const response = await agent.processResourceRequest(request);
            expect(response.granted).toBe(false);
            expect(response.reason).toContain('not managed by this agent');
            expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'resource_request_denied', resource: 'GPU' }));
        });

        it('should deny if resource amount is insufficient', async () => {
            const request = { id: 'req4', resource: 'CPU', amount: 100 };
            const response = await agent.processResourceRequest(request);
            expect(response.granted).toBe(false);
            expect(response.reason).toContain('insufficient amount');
            expect(agent.availableResources.get('CPU')).toBe(50); // Unchanged
            expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'resource_request_denied', requestedAmount: 100, availableAmount: 50 }));
        });

        it('should deny if requested amount is zero', async () => {
            const request = { id: 'req5', resource: 'CPU', amount: 0 };
            const response = await agent.processResourceRequest(request);
            expect(response.granted).toBe(false);
            expect(response.reason).toContain('must be a positive number');
            expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'resource_request_error', error: expect.stringContaining('must be a positive number')}));
        });

        it('should deny if requested amount is negative', async () => {
            const request = { id: 'req6', resource: 'CPU', amount: -5 };
            const response = await agent.processResourceRequest(request);
            expect(response.granted).toBe(false);
            expect(response.reason).toContain('must be a positive number');
            expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'resource_request_error', error: expect.stringContaining('must be a positive number')}));
        });
         it('should deny if resource field is missing or invalid', async () => {
            const request = { id: 'req7', resource: null as any, amount: 5 };
            const response = await agent.processResourceRequest(request);
            expect(response.granted).toBe(false);
            expect(response.reason).toContain('resource field is missing or invalid');
            expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'resource_request_error', error: expect.stringContaining('resource field is missing or invalid')}));
        });
    });

    describe('processResourceResponse', () => {
        let step1: Step;
        const mockPersistenceManager = new AgentPersistenceManager() as jest.Mocked<AgentPersistenceManager>;
        const MockStepCtor = Step as jest.MockedClass<typeof Step>;
        const requestId = 'resReq1';

        beforeEach(() => {
            step1 = new MockStepCtor({ id: 's1', actionVerb: 'RESOURCE_USER', status: StepStatus.PAUSED, persistenceManager: mockPersistenceManager });
            agent.steps = [step1];
            agent.pendingResourceRequests.set(requestId, { stepId: 's1', resource: 'CPU', amount: 10 });
            // Reset agent status for tests that might change it
            agent.status = AgentStatus.RUNNING;
        });

        it('should process granted response with data, update step inputs, and set step to PENDING', async () => {
            const response: ResourceResponse = { requestId, granted: true, resource: 'CPU', data: { coreId: 'core-5' }, senderId: 'resourceManager' };
            await agent.processResourceResponse(response);

            expect(step1.inputs.has(`granted_CPU_${requestId}`)).toBe(true);
            expect(step1.inputs.get(`granted_CPU_${requestId}`)?.inputValue).toEqual({ coreId: 'core-5' });
            expect(step1.status).toBe(StepStatus.PENDING);
            expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'step_inputs_updated_by_resource', stepId: 's1' }));
            expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'step_unblocked_by_resource', stepId: 's1' }));
            expect(agent.notifyTrafficManager).toHaveBeenCalled();
            expect(agent.pendingResourceRequests.has(requestId)).toBe(false);
            expect(agent.saveAgentState).toHaveBeenCalled();
        });

        it('should process granted response without data and set step to PENDING', async () => {
            const response: ResourceResponse = { requestId, granted: true, resource: 'RAM', senderId: 'resourceManager' };
            await agent.processResourceResponse(response);

            expect(step1.status).toBe(StepStatus.PENDING);
             expect(mockLogEvent).not.toHaveBeenCalledWith(expect.objectContaining({ eventType: 'step_inputs_updated_by_resource'})); // No data to update inputs with
            expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'step_unblocked_by_resource', stepId: 's1' }));
            expect(agent.notifyTrafficManager).toHaveBeenCalled();
        });

        it('should not change step status if step was not PAUSED for granted response', async () => {
            (step1 as any).status = StepStatus.RUNNING; // Step is not in PAUSED state
            const response: ResourceResponse = { requestId, granted: true, resource: 'CPU', senderId: 'resourceManager' };
            await agent.processResourceResponse(response);

            expect(step1.status).toBe(StepStatus.RUNNING); // Status should remain unchanged
            expect(agent.notifyTrafficManager).not.toHaveBeenCalled(); // Not called if step wasn't unblocked from PAUSED
        });

        it('should process denied response, set step to ERROR, and agent to PLANNING', async () => {
            const response: ResourceResponse = { requestId, granted: false, resource: 'CPU', message: 'Insufficient quota', senderId: 'resourceManager' };
            await agent.processResourceResponse(response);

            expect(step1.status).toBe(StepStatus.ERROR);
            expect(agent.status).toBe(AgentStatus.PLANNING);
            expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'step_failed_resource_denial', stepId: 's1' }));
            expect(agent.notifyTrafficManager).toHaveBeenCalled();
            expect(agent.pendingResourceRequests.has(requestId)).toBe(false);
        });

        it('should log warning for orphaned requestId', async () => {
            const response: ResourceResponse = { requestId: 'orphanReq', granted: true, resource: 'CPU', senderId: 'resourceManager' };
            await agent.processResourceResponse(response);

            expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'resource_response_orphaned', requestId: 'orphanReq' }));
            expect(step1.status).toBe(StepStatus.PAUSED); // Original step status unchanged
            expect(agent.status).toBe(AgentStatus.RUNNING); // Agent status unchanged
        });

        it('should handle granted response when target step for data is not found', async () => {
            agent.pendingResourceRequests.set('reqWithNoStep', { stepId: 'nonExistentStep', resource: 'CPU', amount: 5 });
            const response: ResourceResponse = { requestId: 'reqWithNoStep', granted: true, resource: 'CPU', data: { info: 'some data' }, senderId: 'resourceManager' };

            await agent.processResourceResponse(response);

            expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({
                eventType: 'resource_data_step_not_found',
                stepId: 'nonExistentStep',
                requestId: 'reqWithNoStep'
            }));
             // The part that unblocks a PAUSED step will also not find 'nonExistentStep', so no error there.
            expect(agent.pendingResourceRequests.has('reqWithNoStep')).toBe(false); // Request should still be cleared
        });
         it('should handle denied response when target step is not found', async () => {
            agent.pendingResourceRequests.set('reqDeniedNoStep', { stepId: 'nonExistentStep', resource: 'CPU', amount: 5 });
            const response: ResourceResponse = { requestId: 'reqDeniedNoStep', granted: false, resource: 'CPU', senderId: 'resourceManager' };

            await agent.processResourceResponse(response);

            // It will log the denial
            expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({
                eventType: 'resource_response_denied',
                requestId: 'reqDeniedNoStep'
            }));
            // It will log "Considering re-planning..."
            // The code `const affectedStep = this.steps.find(s => s.id === pendingRequestInfo.stepId);` will result in affectedStep being undefined.
            // So, agent status will not change to PLANNING, and step status won't change.
            expect(agent.status).toBe(AgentStatus.RUNNING);
            expect(agent.notifyTrafficManager).not.toHaveBeenCalled(); // No step was directly affected to trigger this in that path
            expect(agent.pendingResourceRequests.has('reqDeniedNoStep')).toBe(false); // Request should still be cleared
        });

    });
});

    describe('Execution Loop', () => {
        it('should execute a pending step', async () => {
            const step = agent.steps[0];
            step.areDependenciesSatisfied = jest.fn().mockReturnValue(true);
            step.execute = jest.fn().mockResolvedValue([{ success: true, result: 'test' }]);

            await (agent as any).runAgent();

            expect(step.execute).toHaveBeenCalled();
            expect(step.status).toBe(StepStatus.COMPLETED);
        });

        it('should handle step failure', async () => {
            const step = agent.steps[0];
            step.areDependenciesSatisfied = jest.fn().mockReturnValue(true);
            step.execute = jest.fn().mockRejectedValue(new Error('test error'));

            await (agent as any).runAgent();

            expect(step.status).toBe(StepStatus.ERROR);
        });

        it('should handle plan generation from a step', async () => {
            const step = agent.steps[0];
            step.areDependenciesSatisfied = jest.fn().mockReturnValue(true);
            const newPlan = [{ actionVerb: 'NEW_STEP' }];
            step.execute = jest.fn().mockResolvedValue([{ resultType: PluginParameterType.PLAN, result: newPlan }]);

            await (agent as any).runAgent();

            expect(agent.steps.length).toBe(2);
            expect(agent.steps[1].actionVerb).toBe('NEW_STEP');
        });
    });