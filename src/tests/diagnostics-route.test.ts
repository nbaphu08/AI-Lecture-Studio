// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/diagnostics/route";

afterEach(() => vi.unstubAllEnvs());
const req = (headers: Record<string, string> = {}, qs = "") => new Request(`http://localhost/api/diagnostics${qs}`, { headers });

describe("GET /api/diagnostics", () => {
  it("is disabled (404) outside development unless a token is configured", async () => {
    vi.stubEnv("GEMINI_API_KEY", "AIzaSyDUMMYKEYDUMMYKEYDUMMYKEY12345");
    expect((await GET(req())).status).toBe(404);
    vi.stubEnv("DIAGNOSTICS_TOKEN", "s3cret-token");
    expect((await GET(req())).status).toBe(404);
    expect((await GET(req({ authorization: "Bearer wrong-token!" }))).status).toBe(404);
  });

  it("with the right token it reports without the key (no key configured → clear failure, no network)", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("DIAGNOSTICS_TOKEN", "s3cret-token");
    const res = await GET(req({ authorization: "Bearer s3cret-token" }, "?mode=full"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: false, mode: "full", receivedGeminiResponse: false, generateRequests: 0 });
    expect(JSON.stringify(json)).not.toContain("s3cret-token");
  });

  it("falls back to the safe 'models' mode for unknown mode values", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("DIAGNOSTICS_TOKEN", "t");
    const json = await (await GET(req({ authorization: "Bearer t" }, "?mode=drop-tables"))).json();
    expect(json.mode).toBe("models");
  });
});
