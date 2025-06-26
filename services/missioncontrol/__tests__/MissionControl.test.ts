import axios from 'axios';
import { MissionControl } from '../src/MissionControl';
import { Mission, Status, MessageType } from '@cktmcs/shared';
import { generateGuid } from '../src/utils/generateGuid';

jest.mock('axios');
// jest.mock('../src/utils/generateGuid'); // generateGuid is not used, uuidv4 is directly used.
jest.mock('uuid', () => ({
  ...jest.requireActual('uuid'),
  v4: jest.fn(),
}));
jest.mock('@cktmcs/shared', () => ({
  ...jest.requireActual('@cktmcs/shared'),
  verifyToken: jest.fn((req, res, next) => next()),
}));

describe('MissionControl', () => {
  let missionControl: MissionControl;
  const mockedAxios = axios as jest.Mocked<typeof axios>;
  const { v4: mockUuidv4 } = jest.requireMock('uuid'); // Get the mocked v4

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock the authenticatedApi used internally by MissionControl instance
    mockedAxios.create.mockReturnValue(mockedAxios); // Ensure BaseEntity constructor gets a mock
    (missionControl as any).authenticatedApi = mockedAxios;


    // Setup default mocks for post calls that might be triggered by constructor or other methods
    // if not specifically overridden in tests.
    mockedAxios.post.mockResolvedValue({ data: {} });
    mockedAxios.get.mockResolvedValue({ data: {} }); // For getServiceUrls if called by BaseEntity
    mockedAxios.delete.mockResolvedValue({ data: {} });


    missionControl = new MissionControl();
    // After instantiation, ensure its internal authenticatedApi is also the mocked one for consistency
    (missionControl as any).authenticatedApi = mockedAxios;


  });

  describe('createMission', () => {
    const mockClientId = 'test-client';
    const mockUserId = 'test-user';

    beforeEach(() => {
      // Common setup for createMission tests
      mockedAxios.post.mockImplementation(async (url: string) => {
        if (url.includes('/createAgent')) {
          return { data: { agentId: 'mock-agent-id' } };
        }
        if (url.includes('/storeData')) { // For saveMissionState
          return { data: { success: true } };
        }
        if (url.includes('/deleteCollection')) { // For clearActionPlanCache
            return { data: { success: true } };
        }
        return { data: {} };
      });
      mockedAxios.delete.mockResolvedValue({ data: {success: true }}); // For clearActionPlanCache
    });

    it('should create a new mission with a provided name', async () => {
      const mockMissionId = 'mock-mission-id-provided-name';
      mockUuidv4.mockReturnValue(mockMissionId);
      
      const missionName = 'My Specific Test Mission';
      const missionGoal = 'Test goal for provided name';

      const mission = await (missionControl as any).createMission({ name: missionName, goal: missionGoal }, mockClientId, mockUserId);

      expect(mission.name).toBe(missionName);
      expect(mission.id).toBe(mockMissionId);
      expect(mission.goal).toBe(missionGoal);
      expect((missionControl as any).missions.get(mockMissionId)).toBeDefined();
      expect((missionControl as any).missions.get(mockMissionId).name).toBe(missionName);

      // Verify TrafficManager call
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/createAgent'),
        expect.objectContaining({
          missionId: mockMissionId,
        })
      );
      // Verify Librarian call for saveMissionState
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/storeData'),
        expect.objectContaining({
          id: mockMissionId,
          collection: 'missions',
        })
      );
    });

    it('should create a new mission with a default timestamp-based name if no name is provided', async () => {
      const mockMissionId = 'mock-mission-id-default-name';
      mockUuidv4.mockReturnValue(mockMissionId);
      const missionGoal = 'Test goal for default name';

      // Mock Date().toISOString() for predictable default name
      const mockTimestamp = "2023-01-01T12-30-45.123Z"; // Hyphens instead of colons
      const expectedDefaultName = `Mission ${mockTimestamp}`;

      const realDateToISOString = Date.prototype.toISOString;
      global.Date.prototype.toISOString = jest.fn(() => mockTimestamp.replace(/:/g, '-')); // Ensure our mock also replaces colons

      const mission = await (missionControl as any).createMission({ goal: missionGoal }, mockClientId, mockUserId);

      global.Date.prototype.toISOString = realDateToISOString; // Restore original method

      expect(mission.name).toBe(expectedDefaultName);
      expect(mission.id).toBe(mockMissionId);
      expect(mission.goal).toBe(missionGoal);
      expect((missionControl as any).missions.get(mockMissionId)).toBeDefined();
      expect((missionControl as any).missions.get(mockMissionId).name).toBe(expectedDefaultName);

      // Verify TrafficManager call
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/createAgent'),
        expect.objectContaining({
          missionId: mockMissionId,
        })
      );
       // Verify Librarian call for saveMissionState
       expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/storeData'),
        expect.objectContaining({
          id: mockMissionId,
          collection: 'missions',
        })
      );
    });

    it('should create a new mission and start it (original test adapted)', async () => {
      const mockMissionId = 'mock-mission-id-original';
      mockUuidv4.mockReturnValue(mockMissionId);

      const mockReq = { // Simulating the structure if called via handleMessage
        body: {
          type: MessageType.CREATE_MISSION,
          content: { goal: 'Test goal original', name: 'Test Mission Original' },
          clientId: 'test-client-original',
          userId: 'test-user-original', // Ensure userId is passed for direct createMission call
        },
      };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      mockedAxios.post.mockResolvedValueOnce({ data: {} });

      await (missionControl as any).handleMessage(mockReq, mockRes);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/createAgent'),
        expect.objectContaining({
          actionVerb: 'ACCOMPLISH',
          missionId: mockMissionId,
        })
      );
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect((missionControl as any).missions.get(mockMissionId)).toBeDefined();
      expect((missionControl as any).missions.get(mockMissionId).status).toBe(Status.RUNNING);
    });
  });

  describe('pauseMission', () => {
    it('should pause a running mission', async () => {
      const mockMissionId = 'mock-mission-id';
      const mockMission: Mission = {
        id: mockMissionId,
        userId: 'test-user',
        name: 'Test Mission',
        goal: 'Test goal',
        status: Status.RUNNING,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (missionControl as any).missions.set(mockMissionId, mockMission);

      const mockReq = {
        body: {
          type: MessageType.PAUSE,
          missionId: mockMissionId,
        },
      };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      mockedAxios.post.mockResolvedValueOnce({ data: {} });

      await (missionControl as any).handleMessage(mockReq, mockRes);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/pauseAgents'),
        expect.objectContaining({ missionId: mockMissionId })
      );
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect((missionControl as any).missions.get(mockMissionId).status).toBe(Status.PAUSED);
    });
  });

  describe('saveMission', () => {
    it('should save a mission', async () => {
      const mockMissionId = 'mock-mission-id';
      const mockMission: Mission = {
        id: mockMissionId,
        userId: 'test-user',
        name: 'Test Mission',
        goal: 'Test goal',
        status: Status.RUNNING,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (missionControl as any).missions.set(mockMissionId, mockMission);

      const mockReq = {
        body: {
          type: MessageType.SAVE,
          missionId: mockMissionId,
          missionName: 'Updated Mission Name',
        },
      };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      mockedAxios.post.mockResolvedValueOnce({ data: {} });

      await (missionControl as any).handleMessage(mockReq, mockRes);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/storeData'),
        expect.objectContaining({
          id: mockMissionId,
          data: expect.objectContaining({ name: 'Updated Mission Name' }),
        })
      );
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect((missionControl as any).missions.get(mockMissionId).name).toBe('Updated Mission Name');
    });
  });

  // Add more tests for other methods like resumeMission, abortMission, loadMission, etc.
});