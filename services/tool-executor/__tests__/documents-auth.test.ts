import { createEventLog, EVENT_LOG_COLLECTION } from '../src/services/EventLog';
import type { SkillEvent } from '../src/adk/events';

/**
 * EventLog writes through the artifacts documents API, which now 401s without
 * a bearer token; every request it makes must carry the service-account
 * Authorization header.
 */
jest.mock('@stage7-nextgen/shared', () => ({
  ...jest.requireActual('@stage7-nextgen/shared'),
  getServiceAuthorizationHeaders: jest.fn(async () => ({ Authorization: 'Bearer svc-tool-executor-test-token' })),
}));

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? undefined : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const EVENT: SkillEvent = {
  id: 'event.vendor-contract-management.completed',
  kind: 'declared',
  status: 'completed',
  assistantId: 'assistant-1',
  skillId: 'vendor-contract-management',
  skillName: 'Vendor Contract Management',
  tier: 'represent' as SkillEvent['tier'],
  emittedAt: new Date().toISOString(),
};

describe('EventLog documents calls carry service auth', () => {
  // EventLog reads ARTIFACTS_URL lazily inside its fetch path, so setting it
  // here is enough — the suite passes on a bare `npm test` too.
  beforeAll(() => {
    process.env.ARTIFACTS_URL = 'http://artifacts:4200';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('attaches the Authorization header when appending an event', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () =>
      jsonResponse(201, { id: 'event-doc' }),
    );

    const persisted = await createEventLog().append(EVENT);

    expect(persisted).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`/api/artifacts/documents`);
    expect(String(init?.body)).toContain(EVENT_LOG_COLLECTION);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer svc-tool-executor-test-token');
  });

  it('attaches the Authorization header when searching recent events', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () =>
      jsonResponse(200, { documents: [] }),
    );

    await createEventLog().recent();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/api/artifacts/documents/search');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer svc-tool-executor-test-token');
  });
});
