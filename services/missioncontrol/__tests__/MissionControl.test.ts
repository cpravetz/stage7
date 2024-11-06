import axios from 'axios';
import { MissionControl } from '../src/MissionControl';
import { Mission, Status, MessageType } from '@cktmcs/shared';
import { generateGuid } from '../src/utils/generateGuid';

jest.mock('axios');
jest.mock('../src/utils/generateGuid');
jest.mock('@cktmcs/shared', () => ({
  ...jest.requireActual('@cktmcs/shared'),
  verifyToken: jest.fn((req, res, next) => next()),
}));

describe('MissionControl', () => {
  let missionControl: MissionControl;
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  beforeEach(() => {
    jest.clearAllMocks();
    missionControl = new MissionControl();
  });

  describe('createMission', () => {
    it('should create a new mission and start it', async () => {
      const mockMissionId = 'mock-mission-id';
      (generateGuid as jest.Mock).mockReturnValue(mockMissionId);
      
      const mockReq = {
        body: {
          type: MessageType.CREATE_MISSION,
          content: { goal: 'Test goal', name: 'Test Mission' },
          clientId: 'test-client',
          user: { id: 'test-user' },
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