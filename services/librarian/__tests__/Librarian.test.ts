import { Librarian } from '../src/Librarian';
import express from 'express';
import request from 'supertest';
import { storeInMongo, loadFromMongo, loadManyFromMongo, aggregateInMongo, deleteManyFromMongo } from '../src/utils/mongoUtils';
import { storeInRedis, loadFromRedis, deleteFromRedis } from '../src/utils/redisUtils';

jest.mock('../src/utils/mongoUtils');
jest.mock('../src/utils/redisUtils');
jest.mock('@cktmcs/shared', () => ({
  BaseEntity: class {},
}));

describe('Librarian', () => {
  let librarian: Librarian;
  let app: express.Application;

  beforeEach(() => {
    librarian = new Librarian();
    app = (librarian as any).app;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('storeData', () => {
    it('should store data in MongoDB', async () => {
      const mockStoreInMongo = storeInMongo as jest.MockedFunction<typeof storeInMongo>;
      mockStoreInMongo.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/storeData')
        .send({ id: '123', data: { foo: 'bar' }, storageType: 'mongo', collection: 'testCollection' });

      expect(response.status).toBe(200);
      expect(mockStoreInMongo).toHaveBeenCalledWith('testCollection', { foo: 'bar' });
    });

    it('should store data in Redis', async () => {
      const mockStoreInRedis = storeInRedis as jest.MockedFunction<typeof storeInRedis>;
      mockStoreInRedis.mockResolvedValue('OK');

      const response = await request(app)
        .post('/storeData')
        .send({ id: '123', data: { foo: 'bar' }, storageType: 'redis' });

      expect(response.status).toBe(200);
      expect(mockStoreInRedis).toHaveBeenCalledWith('data:123', JSON.stringify({ foo: 'bar' }));
    });
  });

  describe('loadData', () => {
    it('should load data from MongoDB', async () => {
      const mockLoadFromMongo = loadFromMongo as jest.MockedFunction<typeof loadFromMongo>;
      mockLoadFromMongo.mockResolvedValue({ foo: 'bar' });

      const response = await request(app)
        .get('/loadData/123?storageType=mongo&collection=testCollection');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: { foo: 'bar' } });
      expect(mockLoadFromMongo).toHaveBeenCalledWith('testCollection', { id: '123' });
    });

    it('should load data from Redis', async () => {
      const mockLoadFromRedis = loadFromRedis as jest.MockedFunction<typeof loadFromRedis>;
      mockLoadFromRedis.mockResolvedValue(JSON.stringify({ foo: 'bar' }));

      const response = await request(app)
        .get('/loadData/123?storageType=redis');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: { foo: 'bar' } });
      expect(mockLoadFromRedis).toHaveBeenCalledWith('data:123');
    });
  });

  describe('storeWorkProduct', () => {
    it('should store work product', async () => {
      const mockStoreInMongo = storeInMongo as jest.MockedFunction<typeof storeInMongo>;
      mockStoreInMongo.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/storeWorkProduct')
        .send({ agentId: 'agent1', stepId: 'step1', data: { result: 'success' } });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'Work product stored', id: 'agent1_step1' });
      expect(mockStoreInMongo).toHaveBeenCalledWith('workProducts', expect.objectContaining({
        id: 'agent1_step1',
        agentId: 'agent1',
        stepId: 'step1',
        data: { result: 'success' },
      }));
    });
  });

  // Add more test cases for other methods as needed
});