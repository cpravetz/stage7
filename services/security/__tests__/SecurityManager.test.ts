import { SecurityManager } from '../src/SecurityManager';
import axios from 'axios';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { CognitoIdentityProviderClient, InitiateAuthCommand } from "@aws-sdk/client-cognito-identity-provider";

jest.mock('axios');
jest.mock('bcrypt');
jest.mock('jsonwebtoken');
jest.mock('@aws-sdk/client-cognito-identity-provider');

describe('SecurityManager', () => {
  let securityManager: SecurityManager;
  const mockJwtSecret = 'test-secret';
  const mockLibrarianUrl = 'mock-librarian:5040';

  beforeEach(() => {
    process.env.JWT_SECRET = mockJwtSecret;
    process.env.LIBRARIAN_URL = mockLibrarianUrl;
    securityManager = new SecurityManager();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('registerUser', () => {
    it('should register a new user successfully', async () => {
      const mockReq = {
        body: {
          email: 'test@example.com',
          password: 'password123',
          name: 'Test User'
        }
      } as any;
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      } as any;

      (axios.post as jest.Mock).mockResolvedValueOnce({ data: { data: [] } });
      (axios.post as jest.Mock).mockResolvedValueOnce({});
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword');
      (jwt.sign as jest.Mock).mockReturnValue('mockToken');

      await securityManager['registerUser'](mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        token: 'mockToken',
        user: expect.objectContaining({
          email: 'test@example.com',
          username: 'Test User'
        })
      }));
    });

    it('should return 409 if user already exists', async () => {
      const mockReq = {
        body: {
          email: 'existing@example.com',
          password: 'password123',
          name: 'Existing User'
        }
      } as any;
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      } as any;

      (axios.post as jest.Mock).mockResolvedValueOnce({ data: { data: [{ email: 'existing@example.com' }] } });

      await securityManager['registerUser'](mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'User already exists' });
    });
  });

  describe('handleLogin', () => {
    it('should login user successfully', async () => {
      const mockReq = {
        body: {
          email: 'test@example.com',
          password: 'password123'
        }
      } as any;
      const mockRes = {
        json: jest.fn()
      } as any;

      const mockUser = {
        id: '123',
        email: 'test@example.com',
        password: 'hashedPassword',
        role: 'user'
      };

      (axios.post as jest.Mock).mockResolvedValueOnce({ data: { data: [mockUser] } });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (jwt.sign as jest.Mock).mockReturnValue('mockToken');

      await securityManager['handleLogin'](mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        token: 'mockToken',
        user: expect.objectContaining({
          email: 'test@example.com'
        })
      }));
    });
  });

  describe('handleCognitoLogin', () => {
    it('should login with Cognito successfully', async () => {
      const mockReq = {
        body: {
          username: 'testuser',
          password: 'password123'
        }
      } as any;
      const mockRes = {
        json: jest.fn()
      } as any;

      process.env.COGNITO_CLIENT_ID = 'mock-client-id';
      securityManager['cognitoClient'] = new CognitoIdentityProviderClient({}) as any;

      const mockSend = jest.fn().mockResolvedValue({
        AuthenticationResult: { AccessToken: 'mockCognitoToken' }
      });
      (CognitoIdentityProviderClient.prototype.send as jest.Mock) = mockSend;

      (axios.post as jest.Mock).mockResolvedValueOnce({ data: { data: [] } });
      (jwt.sign as jest.Mock).mockReturnValue('mockToken');

      await securityManager['handleCognitoLogin'](mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        token: 'mockToken',
        user: expect.objectContaining({
          email: 'testuser'
        })
      }));
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', async () => {
      const mockReq = {
        headers: {
          authorization: 'Bearer validToken'
        }
      } as any;
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      } as any;

      const decodedToken = {
        id: '123',
        email: 'test@example.com',
        role: 'user'
      };

      (jwt.verify as jest.Mock).mockReturnValue(decodedToken);
      (axios.post as jest.Mock).mockResolvedValueOnce({ data: { data: [{ email: 'test@example.com' }] } });

      await securityManager['verifyToken'](mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        valid: true,
        user: decodedToken
      }));
    });

    it('should return 401 for invalid token', async () => {
      const mockReq = {
        headers: {
          authorization: 'Bearer invalidToken'
        }
      } as any;
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      } as any;

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new jwt.JsonWebTokenError('Invalid token');
      });

      await securityManager['verifyToken'](mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    });
  });
});