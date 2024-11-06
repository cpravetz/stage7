import axios from 'axios';
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../src/SecurityMiddleware';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('SecurityMiddleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction = jest.fn();

  beforeEach(() => {
    mockRequest = {
      headers: {},
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    nextFunction = jest.fn();
  });

  it('should return 401 if no token is provided', async () => {
    await verifyToken(mockRequest as Request, mockResponse as Response, nextFunction);

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockResponse.json).toHaveBeenCalledWith({ error: 'No token provided' });
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('should call next() if token is valid', async () => {
    mockRequest.headers = { authorization: 'Bearer valid_token' };
    mockedAxios.get.mockResolvedValueOnce({ data: { valid: true, user: { id: '123' } } });

    await verifyToken(mockRequest as Request, mockResponse as Response, nextFunction);

    expect(mockedAxios.get).toHaveBeenCalledWith('http://securitymanager:5010/auth/verify', {
      headers: { Authorization: 'Bearer valid_token' },
    });
    expect((mockRequest as any).user).toEqual({ id: '123' });
    expect(nextFunction).toHaveBeenCalled();
  });

  it('should return 401 if token is invalid', async () => {
    mockRequest.headers = { authorization: 'Bearer invalid_token' };
    mockedAxios.get.mockResolvedValueOnce({ data: { valid: false } });

    await verifyToken(mockRequest as Request, mockResponse as Response, nextFunction);

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('should return 500 if there is an error verifying the token', async () => {
    mockRequest.headers = { authorization: 'Bearer error_token' };
    mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

    await verifyToken(mockRequest as Request, mockResponse as Response, nextFunction);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Failed to authenticate token' });
    expect(nextFunction).not.toHaveBeenCalled();
  });
});