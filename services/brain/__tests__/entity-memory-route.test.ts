import express from 'express';
import request from 'supertest';
import brainRouter from '../src/routes/brain';
import { EntityMemoryStore } from '../src/services/EntityMemoryStore';
import { brainInstance } from '../src/utils/sharedInstance';
import * as sharedInstance from '../src/utils/sharedInstance';

const app = express();
app.use(express.json());
app.use('/api/brain', brainRouter);

describe('Brain entity memory route', () => {
  afterEach(() => jest.restoreAllMocks());

  it('extracts stage memories and persists them through the Artifacts-backed store', async () => {
    jest.spyOn(sharedInstance, 'getBrainInstance').mockResolvedValue(brainInstance);
    jest.spyOn(brainInstance, 'complete').mockResolvedValue({
      content: JSON.stringify({
        summary: 'Contract review completed.',
        preferences: ['Concise reports'],
        constraints: ['Use current law'],
        decisions: [],
      }),
      model: 'test-model',
      provider: 'test-provider',
      cached: false,
      requestId: 'brain-memory-test',
    });
    const upsert = jest.spyOn(EntityMemoryStore.prototype, 'upsert').mockImplementation(async (input) => ({
      ...input,
      active: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }));

    const response = await request(app)
      .post('/api/brain/memory/entity')
      .send({
        tenantId: 'tenant-1',
        entityId: 'matter-9',
        assistantId: 'legal',
        missionId: 'mission-12',
        stageName: 'Clause review',
        stageOutput: 'The client prefers short reports and current law.',
      });

    expect(response.status).toBe(201);
    expect(response.body.memory).toMatchObject({
      entityId: 'matter-9',
      preferences: ['Concise reports'],
    });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      entityId: 'matter-9',
      missionId: 'mission-12',
    }));
  });
});
