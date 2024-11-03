import SecurityManager from '../src/SecurityManager';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

jest.mock('axios');
jest.mock('jsonwebtoken');
jest.mock('bcrypt');
jest.mock('uuid');

describe('SecurityManager', () => {
  let securityManager: SecurityManager;
  let mockRequest: any;
  let mockResponse: any;

  beforeEach(() => {
    securityManager = new SecurityManager();
    mockRequest = {
      body: {},
      headers: {},
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    process.env.JWT_SECRET = 'test-secret';
    process.env.COMPONENT_TOKEN_SECRET = 'component-secret';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('registerUser', () => {
    it('should register a new user successfully', async () => {
      mockRequest.body = {
        email: 'test@example.com',
        password: 'password123',
        username: 'testuser',
      };

      (axios.get as jest.Mock).mockResolvedValueOnce({ data: { data: null } });
      (axios.post as jest.Mock).mockResolvedValueOnce({});
      (bcrypt.hash as jest.Mock).mockResolvedValueOnce('hashedPassword');
      (uuidv4 as jest.Mock).mockReturnValueOnce('mock-uuid');
      (jwt.sign as jest.Mock).mockReturnValueOnce('mock-token');

      await securityManager['registerUser'](mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'mock-token',
          user: expect.objectContaining({
            id: 'mock-uuid',
            email: 'test@example.com',
            username: 'testuser',
          }),
        })
      );
    });

    it('should return an error if user already exists', async () => {
      mockRequest.body = {
        email: 'existing@example.com',
        password: 'password123',
        username: 'existinguser',
      };

      (axios.get as jest.Mock).mockResolvedValueOnce({ data: { data: { id: 'existing-id' } } });

      await securityManager['registerUser'](mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(409);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'User already exists' });
    });
  });

  describe('handleLogin', () => {
    it('should login a user successfully', async () => {
      mockRequest.body = {
        email: 'user@example.com',
        password: 'password123',
      };

      const mockUser = {
        id: 'user-id',
        email: 'user@example.com',
        role: 'user',
      };

      (jwt.sign as jest.Mock).mockReturnValueOnce('mock-token');

      // Mock passport authenticate
      const mockPassportAuthenticate = jest.fn((strategy, options, callback) => {
        callback(null, mockUser, undefined);
        return (req: any, res: any) => {};
      });

      securityManager['passport'] = {
        authenticate: mockPassportAuthenticate,
      } as any;

      await securityManager['handleLogin'](mockRequest, mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'mock-token',
          user: expect.objectContaining({
            id: 'user-id',
            email: 'user@example.com',
          }),
        })
      );
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', async () => {
      mockRequest.headers.authorization = 'Bearer valid-token';
      const mockDecodedToken = {
        id: 'user-id',
        email: 'user@example.com',
        role: 'user',
        iat: Date.now(),
        exp: Date.now() + 3600000,
      };

      (jwt.verify as jest.Mock).mockReturnValueOnce(mockDecodedToken);
      (axios.get as jest.Mock).mockResolvedValueOnce({ data: { data: { id: 'user-id' } } });

      await securityManager['verifyToken'](mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        valid: true,
        user: expect.objectContaining({
          id: 'user-id',
          email: 'user@example.com',
          role: 'user',
        }),
      });
    });

    it('should return an error for an invalid token', async () => {
      mockRequest.headers.authorization = 'Bearer invalid-token';

      (jwt.verify as jest.Mock).mockImplementationOnce(() => {
        throw new jwt.JsonWebTokenError('Invalid token');
      });

      await securityManager['verifyToken'](mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    });
  });

  // Add more test cases for other methods as needed
});