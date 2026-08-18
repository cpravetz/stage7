import { AssistantClient } from './AssistantClient';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

const createClient = () => new AssistantClient('http://localhost:3000/api/test', 'ws://localhost:3000/ws/test');

describe('AssistantClient', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    mockFetch.mockClear();
  });

  test('getContext makes a GET request to the correct endpoint', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ contextItems: [] }),
    });

    const client = createClient();
    const result = await client.getContext('conv-123');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/test/conversations/conv-123/context',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      })
    );
    expect(result).toEqual({ contextItems: [] });
  });

  test('getContext includes authorization token when available', async () => {
    mockLocalStorage.setItem('auth_tokens', JSON.stringify({ accessToken: 'test-token' }));
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ contextItems: [] }),
    });

    const client = createClient();
    await client.getContext('conv-123');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token',
        }),
      })
    );
  });

  test('getSuggestedActions makes a GET request to the correct endpoint', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ actions: [{ id: '1', title: 'Test', description: 'Desc', type: 'test' }] }),
    });

    const client = createClient();
    const result = await client.getSuggestedActions('conv-123');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/test/conversations/conv-123/suggested-actions',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      })
    );
    expect(result).toEqual({ actions: [{ id: '1', title: 'Test', description: 'Desc', type: 'test' }] });
  });

  test('triggerAction makes a POST request to the correct endpoint', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const client = createClient();
    await client.triggerAction('conv-123', 'action-id', { foo: 'bar' });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/test/conversations/conv-123/actions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ actionId: 'action-id', params: { foo: 'bar' } }),
      })
    );
  });

  test('getContext throws on non-ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Server Error',
    });

    const client = createClient();
    await expect(client.getContext('conv-123')).rejects.toThrow('Failed to get context via AssistantAPI: 500 Server Error');
  });
});
