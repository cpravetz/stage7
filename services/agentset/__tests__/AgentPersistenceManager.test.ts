
import { AgentPersistenceManager, AgentState } from '../src/utils/AgentPersistenceManager';
import { WorkProduct } from '../src/utils/WorkProduct';
import { PluginOutput, PluginParameterType } from '@cktmcs/shared';

// Mock the authenticatedApi
const mockAuthenticatedApi = {
  post: jest.fn(),
  get: jest.fn(),
  delete: jest.fn(),
};

jest.mock('@cktmcs/shared', () => ({
  ...jest.requireActual('@cktmcs/shared'),
  createAuthenticatedAxios: () => mockAuthenticatedApi,
}));

describe('AgentPersistenceManager', () => {
  let persistenceManager: AgentPersistenceManager;

  beforeEach(() => {
    persistenceManager = new AgentPersistenceManager('librarian:5040', mockAuthenticatedApi);
    mockAuthenticatedApi.post.mockClear();
    mockAuthenticatedApi.get.mockClear();
    mockAuthenticatedApi.delete.mockClear();
  });

  describe('saveAgent', () => {
    it('should call the librarian service to save the agent state', async () => {
      const agentState: AgentState = {
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
      };

      await persistenceManager.saveAgent(agentState);

      expect(mockAuthenticatedApi.post).toHaveBeenCalledWith(
        'http://librarian:5040/storeData',
        expect.objectContaining({
          id: 'test-agent',
          collection: 'agents',
        })
      );
    });
  });

  describe('logEvent', () => {
    it('should call the librarian service to log an event', async () => {
      const event = { type: 'test-event' };
      await persistenceManager.logEvent(event);

      expect(mockAuthenticatedApi.post).toHaveBeenCalledWith(
        'http://librarian:5040/storeData',
        expect.objectContaining({
          collection: 'events',
        })
      );
    });
  });

  describe('loadAgent', () => {
    it('should call the librarian service to load the agent state', async () => {
      mockAuthenticatedApi.get.mockResolvedValue({ data: { data: {} } });
      await persistenceManager.loadAgent('test-agent');

      expect(mockAuthenticatedApi.get).toHaveBeenCalledWith(
        'http://librarian:5040/loadData/test-agent',
        { params: { storageType: 'mongo', collection: 'agents' } }
      );
    });
  });

  describe('deleteAgent', () => {
    it('should call the librarian service to delete the agent state', async () => {
      await persistenceManager.deleteAgent('test-agent');

      expect(mockAuthenticatedApi.delete).toHaveBeenCalledWith(
        'http://librarian:5040/deleteData/test-agent',
        { params: { storageType: 'mongo', collection: 'agents' } }
      );
    });
  });

  describe('saveWorkProduct', () => {
    it('should call the librarian service to save a work product', async () => {
      const workProduct = new WorkProduct('test-agent', 'test-step', []);
      await persistenceManager.saveWorkProduct(workProduct);

      expect(mockAuthenticatedApi.post).toHaveBeenCalledWith(
        'http://librarian:5040/storeWorkProduct',
        expect.objectContaining({
          agentId: 'test-agent',
          stepId: 'test-step',
        })
      );
    });
  });

  describe('loadWorkProduct', () => {
    it('should call the librarian service to load a work product', async () => {
      mockAuthenticatedApi.get.mockResolvedValue({ data: { data: {} } });
      await persistenceManager.loadWorkProduct('test-agent', 'test-step');

      expect(mockAuthenticatedApi.get).toHaveBeenCalledWith(
        'http://librarian:5040/loadData/test-agent_test-step',
        { params: { storageType: 'mongo', collection: 'work_products' } }
      );
    });
  });

  describe('getStepEvents', () => {
    it('should call the librarian service to get step events', async () => {
      mockAuthenticatedApi.get.mockResolvedValue({ data: { data: [] } });
      await persistenceManager.getStepEvents('test-step');

      expect(mockAuthenticatedApi.get).toHaveBeenCalledWith(
        'http://librarian:5040/queryData',
        { params: { storageType: 'mongo', collection: 'step_events', query: { stepId: 'test-step' } } }
      );
    });
  });

  describe('getStepErrorHistory', () => {
    it('should call the librarian service to get step error history', async () => {
      mockAuthenticatedApi.get.mockResolvedValue({ data: { data: [] } });
      await persistenceManager.getStepErrorHistory('test-step');

      expect(mockAuthenticatedApi.get).toHaveBeenCalledWith(
        'http://librarian:5040/queryData',
        expect.anything()
      );
    });
  });

  describe('getRecoveryAttempts', () => {
    it('should call getStepEvents and count recovery attempts', async () => {
      const mockEvents = [
        { eventType: 'recovery_attempt' },
        { eventType: 'step_retry' },
        { eventType: 'some_other_event' },
      ];
      mockAuthenticatedApi.get.mockResolvedValue({ data: { data: mockEvents } });

      const attempts = await persistenceManager.getRecoveryAttempts('test-step');

      expect(attempts).toBe(2);
    });
  });

  describe('clearStepHistory', () => {
    it('should call the librarian service to delete step events', async () => {
      await persistenceManager.clearStepHistory('test-step');

      expect(mockAuthenticatedApi.delete).toHaveBeenCalledWith(
        'http://librarian:5040/deleteData',
        { params: { storageType: 'mongo', collection: 'step_events', query: { stepId: 'test-step' } } }
      );
    });
  });

  describe('loadAllWorkProducts', () => {
    it('should call the librarian service to load all work products for an agent', async () => {
      mockAuthenticatedApi.get.mockResolvedValue({ data: [] });
      await persistenceManager.loadAllWorkProducts('test-agent');

      expect(mockAuthenticatedApi.get).toHaveBeenCalledWith(
        'http://librarian:5040/loadAllWorkProducts/test-agent'
      );
    });
  });
});
