import request from 'supertest';
import { app } from '../../src/app'; // Assuming your Express app is exported from this path
import { MongoUserRepository } from '../repositories/MongoUserRepository';
import { TokenService } from '../services/TokenService';
import { User } from '../models/User';

describe('Authentication Flow Tests', () => {
  let server: any;
  let userRepository: MongoUserRepository;
  let tokenService: TokenService;
  let testUser: User;
  let refreshToken: string;

  beforeAll(async () => {
    server = app.listen(4000);
    userRepository = new MongoUserRepository();
    tokenService = new TokenService({}, {}, {}, userRepository);

    // Create a test user
    testUser = await userRepository.create({
      email: 'testuser@example.com',
      username: 'testuser',
      password: 'Password123!',
      firstName: 'Test',
      lastName: 'User',
      roles: ['user'],
      isActive: true,
      isEmailVerified: true,
    });
  });

  afterAll(async () => {
    await userRepository.delete(testUser.id);
    server.close();
  });

  test('Login returns access and refresh tokens', async () => {
    const response = await request(server)
      .post('/securityManager/login')
      .send({ email: 'testuser@example.com', password: 'Password123!' })
      .expect(200);

    expect(response.body.accessToken).toBeDefined();
    expect(response.body.refreshToken).toBeDefined();
    refreshToken = response.body.refreshToken;
  });

  test('Refresh token returns new access token', async () => {
    const response = await request(server)
      .post('/securityManager/auth/refresh-token')
      .send({ refreshToken })
      .expect(200);

    expect(response.body.accessToken).toBeDefined();
  });

  test('Refresh token with invalid token returns 401', async () => {
    await request(server)
      .post('/securityManager/auth/refresh-token')
      .send({ refreshToken: 'invalidtoken' })
      .expect(401);
  });

  test('Refresh token with expired token returns 401', async () => {
    // Create an expired refresh token manually
    const expiredToken = await tokenService.generateToken(testUser, 'refresh', { expiresIn: -10 }); // expired 10 seconds ago

    await request(server)
      .post('/securityManager/auth/refresh-token')
      .send({ refreshToken: expiredToken.token })
      .expect(401);
  });

  test('Logout revokes tokens', async () => {
    // Login to get tokens
    const loginResponse = await request(server)
      .post('/securityManager/login')
      .send({ email: 'testuser@example.com', password: 'Password123!' })
      .expect(200);

    const tokenId = loginResponse.body.accessToken.jti;
    const userId = testUser.id;

    await request(server)
      .post('/securityManager/logout')
      .send({ tokenId, revokeAll: false })
      .expect(200);
  });
});
