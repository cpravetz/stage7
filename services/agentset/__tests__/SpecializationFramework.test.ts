
import { SpecializationFramework, AgentSpecialization } from '../src/specialization/SpecializationFramework';
import { Agent } from '../src/agents/Agent';
import { AgentStatus } from '../src/utils/agentStatus';
import { AuthenticatedApiClient, PredefinedRoles } from '@cktmcs/shared';

// Mock dependencies
jest.mock('@cktmcs/shared', () => ({
  ...jest.requireActual('@cktmcs/shared'),
  AuthenticatedApiClient: jest.fn().mockImplementation(() => ({
    post: jest.fn(),
    get: jest.fn(),
  })),
}));
jest.mock('../src/agents/Agent');

describe('SpecializationFramework', () => {
  let specializationFramework: SpecializationFramework;
  let mockAgents: Map<string, Agent>;
  let mockAgent: jest.Mocked<Agent>;
  let mockAuthenticatedApi: jest.Mocked<AuthenticatedApiClient>;

  beforeEach(() => {
    mockAgents = new Map<string, Agent>();
    specializationFramework = new SpecializationFramework(mockAgents, 'librarian:5040', 'brain:5070');
    mockAuthenticatedApi = (specializationFramework as any).authenticatedApi;

    // Create a mock agent
    mockAgent = new Agent({
      id: 'test-agent',
      missionId: 'test-mission',
      actionVerb: 'TEST',
      agentSetUrl: 'http://localhost:9001',
    }) as jest.Mocked<Agent>;

    mockAgents.set('test-agent', mockAgent);
  });

  describe('assignRole', () => {
    it('should assign a role to an agent', async () => {
      mockAuthenticatedApi.post.mockResolvedValue({} as any);
      const role = PredefinedRoles.EXECUTOR;

      const specialization = await specializationFramework.assignRole('test-agent', role.id);

      expect(specialization.roleId).toBe(role.id);
      expect(mockAgent.setRole).toHaveBeenCalledWith(role.id);
    });
  });

  describe('findBestAgentForTask', () => {
    it('should find the best agent for a task', async () => {
      const role = PredefinedRoles.EXECUTOR;
      await specializationFramework.assignRole('test-agent', role.id);

      const agentId = specializationFramework.findBestAgentForTask(role.id, 'TEST');

      expect(agentId).toBe('test-agent');
    });
  });

  describe('generateSpecializedPrompt', () => {
    it('should generate a specialized prompt for an agent', async () => {
      const role = PredefinedRoles.EXECUTOR;
      await specializationFramework.assignRole('test-agent', role.id);

      const prompt = await specializationFramework.generateSpecializedPrompt('test-agent', 'test task');

      expect(prompt).toContain(role.systemPrompt);
      expect(prompt).toContain('test task');
    });
  });
});
