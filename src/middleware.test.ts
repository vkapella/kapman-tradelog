// #344: identity propagation through the Cloudflare Access middleware.
//
// The security property under test: the inbound x-kapman-user header is
// deleted before ANY allow path is evaluated, every allowed request forwards
// sanitized headers via NextResponse.next({ request: { headers } }), and the
// header is re-set ONLY for a verified human (or dev@local when the gate is
// unconfigured). A forged header must not survive any branch — including a
// request that authenticates with a valid bearer token.
//
// The #336 JWT verification itself is covered by access-jwt.test.ts, which
// stays untouched; here the auth collaborators are mocked per branch.

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { middleware } from "@/middleware";

const verifyAccessJwt = vi.hoisted(() => vi.fn());
const accessConfig = vi.hoisted(() => vi.fn());
const bearerTokenOk = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/access-jwt", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/access-jwt")>();
  return { ...actual, accessConfig, verifyAccessJwt };
});
vi.mock("@/lib/auth/bearer", () => ({ bearerTokenOk }));

const ACCESS = { teamDomain: "kapmancapital.cloudflareaccess.com", aud: "aud" };

function buildRequest(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`https://tradelog.kapmancapital.com${path}`, { headers });
}

/** The request headers that NextResponse.next({ request }) forwards. */
function forwardedHeader(response: Response, name: string): string | null {
  const overrides = response.headers.get("x-middleware-override-headers");
  if (overrides === null) {
    return null;
  }
  return response.headers.get(`x-middleware-request-${name}`);
}

function forwardsSanitizedHeaders(response: Response): boolean {
  return response.headers.get("x-middleware-override-headers") !== null;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("middleware identity propagation", () => {
  it("dev bypass: strips a forged header and sets dev@local", async () => {
    accessConfig.mockReturnValue(null);

    const response = await middleware(buildRequest("/dashboard", { "x-kapman-user": "victim@kapmancapital.com" }));

    expect(forwardsSanitizedHeaders(response)).toBe(true);
    expect(forwardedHeader(response, "x-kapman-user")).toBe("dev@local");
  });

  it("health check: strips a forged header and forwards no identity", async () => {
    accessConfig.mockReturnValue(ACCESS);

    const response = await middleware(buildRequest("/api/health", { "x-kapman-user": "victim@kapmancapital.com" }));

    expect(forwardsSanitizedHeaders(response)).toBe(true);
    expect(forwardedHeader(response, "x-kapman-user")).toBeNull();
    expect(verifyAccessJwt).not.toHaveBeenCalled();
  });

  it("valid bearer WITH a forged x-kapman-user: reaches routes with no identity header", async () => {
    accessConfig.mockReturnValue(ACCESS);
    bearerTokenOk.mockReturnValue(true);

    const response = await middleware(
      buildRequest("/api/executions", {
        authorization: "Bearer machine-token",
        "x-kapman-user": "victim@kapmancapital.com",
      }),
    );

    expect(forwardsSanitizedHeaders(response)).toBe(true);
    expect(forwardedHeader(response, "x-kapman-user")).toBeNull();
  });

  it("verified human: sets the normalized email, replacing any forged value", async () => {
    accessConfig.mockReturnValue(ACCESS);
    bearerTokenOk.mockReturnValue(false);
    verifyAccessJwt.mockResolvedValue({ email: "  Victor.Kapella@KapmanCapital.com ", isServiceToken: false });

    const response = await middleware(buildRequest("/dashboard", { "x-kapman-user": "ron.nyman@kapmancapital.com" }));

    expect(forwardsSanitizedHeaders(response)).toBe(true);
    expect(forwardedHeader(response, "x-kapman-user")).toBe("victor.kapella@kapmancapital.com");
  });

  it("service token: forwards with no identity header", async () => {
    accessConfig.mockReturnValue(ACCESS);
    bearerTokenOk.mockReturnValue(false);
    verifyAccessJwt.mockResolvedValue({ email: "kapman-kb", isServiceToken: true });

    const response = await middleware(buildRequest("/api/executions", { "x-kapman-user": "victim@kapmancapital.com" }));

    expect(forwardsSanitizedHeaders(response)).toBe(true);
    expect(forwardedHeader(response, "x-kapman-user")).toBeNull();
  });

  // #353: iOS fetches the home-screen icon with no cookies; the brand mark and
  // manifest are public, everything else stays gated.
  it("public brand assets: forwarded without credentials and without identity", async () => {
    accessConfig.mockReturnValue(ACCESS);
    bearerTokenOk.mockReturnValue(false);
    verifyAccessJwt.mockResolvedValue(null);

    for (const path of ["/apple-icon.png?abc123", "/apple-touch-icon.png", "/icon.png", "/manifest.webmanifest", "/icons/icon-192.png"]) {
      const response = await middleware(buildRequest(path, { "x-kapman-user": "victim@kapmancapital.com" }));
      expect(response.status, path).toBe(200);
      expect(forwardsSanitizedHeaders(response), path).toBe(true);
      expect(forwardedHeader(response, "x-kapman-user"), path).toBeNull();
    }

    const gated = await middleware(buildRequest("/icons-not-public/secret.png"));
    expect(gated.status).toBe(401);
    expect(verifyAccessJwt).toHaveBeenCalledTimes(1);
  });

  it("unverified request: 401, nothing forwarded", async () => {
    accessConfig.mockReturnValue(ACCESS);
    bearerTokenOk.mockReturnValue(false);
    verifyAccessJwt.mockResolvedValue(null);

    const response = await middleware(buildRequest("/dashboard", { "x-kapman-user": "victim@kapmancapital.com" }));

    expect(response.status).toBe(401);
    expect(forwardsSanitizedHeaders(response)).toBe(false);
  });

  it("does not strip or interpret the expected-identity guard header", async () => {
    accessConfig.mockReturnValue(null);

    const response = await middleware(
      buildRequest("/api/profile", { "x-kapman-expected-user": "victor.kapella@kapmancapital.com" }),
    );

    // The guard is client-owned; only the profile routes compare it.
    expect(forwardedHeader(response, "x-kapman-expected-user")).toBe("victor.kapella@kapmancapital.com");
  });
});
