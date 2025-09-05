
import { StateManager } from '../src/utils/StateManager';
import { AgentPersistenceManager } from '../src/utils/AgentPersistenceManager';

// Mock AgentPersistenceManager
jest.mock('../src/utils/AgentPersistenceManager');

describe('StateManager', () => {
  let stateManager: StateManager;
  let mockPersistenceManager: jest.Mocked<AgentPersistenceManager>;

  beforeEach(() => {
    mockPersistenceManager = new AgentPersistenceManager() as jest.Mocked<AgentPersistenceManager>;
    stateManager = new StateManager('test-agent', mockPersistenceManager);
  });

  describe('saveState', () => {
    it('should call saveAgent on the persistence manager with the correct state', async () => {
      const agent = {
        id: 'test-agent',
        status: 'running',
        output: null,
        inputValues: new Map(),
        missionId: 'test-mission',
        steps: [],
        dependencies: [],
        capabilitiesManagerUrl: '',
        brainUrl: '',
        trafficManagerUrl: '',
        librarianUrl: '',
        conversation: [],
        missionContext: '',
      };

      await stateManager.saveState(agent);

      expect(mockPersistenceManager.saveAgent).toHaveBeenCalledWith({
        id: 'test-agent',
        status: 'running',
        output: null,
        inputs: new Map(),
        missionId: 'test-mission',
        steps: [],
        dependencies: [],
        capabilitiesManagerUrl: '',
        brainUrl: '',
        trafficManagerUrl: '',
        librarianUrl: '',
        conversation: [],
        missionContext: '',
      });
    });
  });

  describe('loadState', () => {
    it('should call loadAgent on the persistence manager and return the state', async () => {
      const expectedState = { id: 'test-agent', status: 'paused' };
      mockPersistenceManager.loadAgent.mockResolvedValue(expectedState);

      const state = await stateManager.loadState();

      expect(mockPersistenceManager.loadAgent).toHaveBeenCalledWith('test-agent');
      expect(state).toEqual(expectedState);
    });
  });

  describe('applyState', () => {
    it('should load the state and apply it to the agent', async () => {
      const loadedState = {
        status: 'paused',
        output: { result: 'test' },
        inputs: new Map([['key', 'value']]),
        missionId: 'loaded-mission',
        steps: [{ id: 'step1' }],
        dependencies: ['dep1'],
        capabilitiesManagerUrl: 'http://cap-man',
        brainUrl: 'http://brain',
        trafficManagerUrl: 'http://traffic-man',
        librarianUrl: 'http://librarian',
        conversation: [{ role: 'user', content: 'hello' }],
        missionContext: 'loaded-context',
        role: 'tester',
        roleCustomizations: { setting: 'high' },
      };
      mockPersistenceManager.loadAgent.mockResolvedValue(loadedState);

      const agent = {} as any;
      await stateManager.applyState(agent);

      expect(agent.status).toBe(loadedState.status);
      expect(agent.output).toEqual(loadedState.output);
      expect(agent.inputValues).toEqual(loadedState.inputs);
      expect(agent.missionId).toBe(loadedState.missionId);
      expect(agent.steps).toEqual(loadedState.steps);
      expect(agent.dependencies).toEqual(loadedState.dependencies);
      expect(agent.capabilitiesManagerUrl).toBe(loadedState.capabilitiesManagerUrl);
      expect(agent.brainUrl).toBe(loadedState.brainUrl);
      expect(agent.trafficManagerUrl).toBe(loadedState.trafficManagerUrl);
      expect(agent.librarianUrl).toBe(loadedState.librarianUrl);
      expect(agent.conversation).toEqual(loadedState.conversation);
      expect(agent.missionContext).toBe(loadedState.missionContext);
      expect(agent.role).toBe(loadedState.role);
      expect(agent.roleCustomizations).toEqual(loadedState.roleCustomizations);
    });
  });
});
