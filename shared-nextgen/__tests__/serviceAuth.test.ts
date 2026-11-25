import {
  getServiceAuthorizationHeaders,
  getServiceToken,
  serviceAuthConfigured,
  resetServiceAuthForTests,
} from '../src/utils/serviceAuth';

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? undefined : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('service token client', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetServiceAuthForTests();
    process.env.AUTH_URL = 'http://auth.test';
    process.env.SERVICE_AUTH_ID = 'brain';
    process.env.SERVICE_API_KEY = 'brain-secret';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
    resetServiceAuthForTests();
  });

  it('reports whether credentials are configured', () => {
    expect(serviceAuthConfigured()).toBe(true);
    delete process.env.SERVICE_API_KEY;
    expect(serviceAuthConfigured()).toBe(false);
  });

  it('exchanges credentials for a token and returns the Authorization header', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      expect(url).toBe('http://auth.test/api/auth/service/auth');
      return jsonResponse(200, { success: true, token: 'service-jwt', service: {} });
    });

    const headers = await getServiceAuthorizationHeaders();

    expect(headers.Authorization).toBe('Bearer service-jwt');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('sends the configured service credentials in the exchange body', async () => {
    let capturedBody: string | undefined;
    jest.spyOn(global, 'fetch').mockImplementation(async (_input, init) => {
      capturedBody = init?.body as string | undefined;
      return jsonResponse(200, { success: true, token: 'service-jwt' });
    });

    await getServiceToken();

    expect(JSON.parse(String(capturedBody))).toEqual({
      serviceId: 'brain',
      apiKey: 'brain-secret',
    });
  });

  it('reuses the cached token within the refresh window', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () =>
      jsonResponse(200, { success: true, token: 'service-jwt' }),
    );

    await getServiceToken();
    await getServiceToken();
    await getServiceAuthorizationHeaders();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('refreshes the token before the one-hour expiry elapses', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () =>
      jsonResponse(200, { success: true, token: 'service-jwt' }),
    );

    await getServiceToken();
    const realNow = Date.now();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(realNow + 56 * 60 * 1000);
    try {
      await getServiceToken();
    } finally {
      nowSpy.mockRestore();
    }
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('returns empty headers and warns once when credentials are not configured', async () => {
    delete process.env.SERVICE_AUTH_ID;
    const fetchSpy = jest.spyOn(global, 'fetch');

    const first = await getServiceAuthorizationHeaders();
    const second = await getServiceAuthorizationHeaders();

    expect(first).toEqual({});
    expect(second).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws when the auth service rejects the credentials', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async () =>
      jsonResponse(401, { success: false, error: 'Invalid service credentials' }),
    );

    await expect(getServiceToken()).rejects.toThrow('Service token request failed (401)');
  });
});
