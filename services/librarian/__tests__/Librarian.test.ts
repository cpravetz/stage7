import { Librarian } from '../src/Librarian';
import express from 'express';
import axios from 'axios';
import { storeInRedis, loadFromRedis, deleteFromRedis } from '../src/utils/redisUtils';
import { storeInMongo, loadFromMongo, loadManyFromMongo, aggregateInMongo, deleteManyFromMongo } from '../src/utils/mongoUtils';

jest.mock('express');
jest.mock('axios');
jest.mock('../src/utils/redisUtils');
jest.mock('../src/utils/mongoUtils');

describe('Librarian', () => {
  let librarian: Librarian;
  let mockApp: jest.Mocked<express.Application>;

  beforeEach(() => {
    mockApp = {
      use: jest.fn(),
      post: jest.fn(),
      get: jest.fn(),
      delete: jest.fn(),
      listen: jest.fn(),
    } as unknown as jest.Mocked<express.Application>;

    (express as jest.MockedFunction<typeof express>).mockReturnValue(mockApp);

    librarian = new Librarian();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize correctly', () => {
    expect(mockApp.use).toHaveBeenCalled();
    expect(mockApp.post).toHaveBeenCalledTimes(4);
    expect(mockApp.get).toHaveBeenCalledTimes(5);
    expect(mockApp.delete).toHaveBeenCalledTimes(1);
    expect(mockApp.listen).toHaveBeenCalled();
  });

  describe('storeData', () => {
    it('should store data in MongoDB', async () => {
      const mockReq = {
        body: { id: 'test-id', data: { key: 'value' }, storageType: 'mongo', collection: 'testCollection' }
      } as express.Request;
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as unknown as express.Response;

      await (librarian as any).storeData(mockReq, mockRes);

      expect(storeInMongo).toHaveBeenCalledWith('testCollection', { key: 'value' });
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('should store data in Redis', async () => {
      const mockReq = {
        body: { id: 'test-id', data: { key: 'value' }, storageType: 'redis' }
      } as express.Request;
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as unknown as express.Response;

      await (librarian as any).storeData(mockReq, mockRes);

      expect(storeInRedis).toHaveBeenCalledWith('data:test-id', JSON.stringify({ key: 'value' }));
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });
  });

  describe('loadData', () => {
    it('should load data from MongoDB', async () => {
      const mockReq = {
        params: { id: 'test-id' },
        query: { storageType: 'mongo', collection: 'testCollection' }
      } as unknown as express.Request;
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as unknown as express.Response;

      const mockData = { key: 'value' };
      (loadFromMongo as jest.Mock).mockResolvedValue(mockData);

      await (librarian as any).loadData(mockReq, mockRes);

      expect(loadFromMongo).toHaveBeenCalledWith('testCollection', { _id: 'test-id' });
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith({ data: mockData });
    });
  });

  // Add more test cases for other methods...

});