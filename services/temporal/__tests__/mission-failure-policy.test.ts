import { MissionClient } from "../src/client/MissionClient";

interface RecordedRequest {
  method: string;
  url: string;
  body?: Record<string, unknown>;
}

function installArtifacts(record: Record<string, unknown>) {
  const state: Record<string, unknown> = { ...record };
  const requests: RecordedRequest[] = [];
  jest.spyOn(global, "fetch").mockImplementation(async (url, init) => {
    const requestUrl = String(url);
    const method = (init?.method || "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ method, url: requestUrl, body });
    if (method === "GET")
      return {
        ok: true,
        status: 200,
        json: async () => ({ ...state }),
      } as Response;
    if (method === "PUT" || method === "POST") {
      if (requestUrl.endsWith("/recovery-lease")) {
        return {
          ok: true,
          status: 200,
          json: async () => (body?.action === "claim" ? { claimed: true } : { renewed: true }),
        } as Response;
      }
      if (requestUrl.endsWith("/events")) {
        return { ok: true, status: 200, json: async () => body } as Response;
      }
      if (requestUrl.endsWith("/api/artifacts/missions")) {
        for (const key of Object.keys(state)) delete state[key];
        Object.assign(state, body);
      } else {
        Object.assign(state, body);
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ...state }),
      } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  });
  return { state, requests };
}

const broadcasts = (requests: RecordedRequest[], type: string) =>
  requests.filter((request) => request.url.endsWith("/events") && request.body?.type === type);

describe("MissionClient mission failure policy", () => {
  const originalArtifactsUrl = process.env.ARTIFACTS_URL;
  const originalGatewayUrl = process.env.GATEWAY_URL;

  beforeEach(() => {
    process.env.ARTIFACTS_URL = "http://artifacts";
    delete process.env.GATEWAY_URL;
    delete process.env.TEMPORAL_ADDRESS;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalArtifactsUrl === undefined) delete process.env.ARTIFACTS_URL;
    else process.env.ARTIFACTS_URL = originalArtifactsUrl;
    if (originalGatewayUrl === undefined) delete process.env.GATEWAY_URL;
    else process.env.GATEWAY_URL = originalGatewayUrl;
  });

  async function runToCompletion(missionId: string, error: Error) {
    const harness = installArtifacts({
      missionId,
      status: "pending",
      controlState: "running",
    });
    const runner = jest.fn(async () => {
      throw error;
    });
    const client = new MissionClient("default", runner as never);
    await client.startMission({
      missionId,
      tenantId: "tenant-1",
      assistantId: "assistant-1",
      prompt: "Do the work",
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    return harness;
  }

  it("does not fail a mission on an agent-runtime HTTP 500 while LLMs remain", async () => {
    const { state, requests } = await runToCompletion(
      "transient-500",
      new Error(
        "Mission agent request failed (HTTP 500). Check the mission activity for details.",
      ),
    );

    expect(state.status).toBe("incomplete");
    expect(broadcasts(requests, "mission_failed")).toHaveLength(0);
    expect(broadcasts(requests, "mission_incomplete").length).toBeGreaterThan(
      0,
    );
  });

  it("does not fail a mission on loss of connectivity to a service", async () => {
    const { state, requests } = await runToCompletion(
      "connectivity",
      new Error("fetch failed: connect ECONNREFUSED 127.0.0.1:3100"),
    );

    expect(state.status).toBe("incomplete");
    expect(broadcasts(requests, "mission_failed")).toHaveLength(0);
  });

  it("fails a mission only when no LLM remains available to process prompts", async () => {
    const { state, requests } = await runToCompletion(
      "llm-exhausted",
      new Error(
        "MODEL_SELECTION_EXHAUSTED: no eligible model remains for this request",
      ),
    );

    expect(state.status).toBe("failed");
    expect(broadcasts(requests, "mission_failed").length).toBeGreaterThan(0);
  });
});
