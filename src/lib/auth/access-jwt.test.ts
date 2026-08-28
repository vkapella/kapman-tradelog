// #336: the Cloudflare Access JWT gate that replaced HTTP Basic auth.
//
// This gate is the only thing between the open internet and the trading journal
// on kapman-tradelog.fly.dev — Access guards the proxied hostname, not the Fly
// one. So these tests care most about the refusals: a token signed by the wrong
// key, aimed at another Access application, issued by another team, or expired
// must not open anything.
//
// Tokens are minted here with a locally generated RSA key and served through a
// stubbed JWKS endpoint, so the whole verification path runs for real
// (kid lookup, RS256 signature, aud/iss/exp) without reaching Cloudflare.

import { SignJWT, exportJWK, generateKeyPair, type JWK } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEAM = "kapmancapital.cloudflareaccess.com";
const AUD = "e1e00501a81e413bf4815271448c029d398a1b29c049ca8f55e7572c35d6f049";
const ISS = `https://${TEAM}`;
const KID = "test-key-1";
const EMAIL = "victor.kapella@kapmancapital.com";

type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>;

let signing: KeyPair;
let other: KeyPair;

async function mint(
  opts: {
    key?: KeyPair;
    aud?: string;
    iss?: string;
    email?: string | null;
    commonName?: string;
    expiresIn?: string;
    issuedAt?: number;
  } = {},
): Promise<string> {
  const key = opts.key ?? signing;
  const claims: Record<string, unknown> = {};
  if (opts.email !== null) {
    claims.email = opts.email ?? EMAIL;
  }
  if (opts.commonName) {
    claims.common_name = opts.commonName;
  }
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: KID })
    .setIssuer(opts.iss ?? ISS)
    .setAudience(opts.aud ?? AUD)
    .setIssuedAt(opts.issuedAt)
    .setExpirationTime(opts.expiresIn ?? "1h")
    .sign(key.privateKey);
}

/** Serve a JWKS containing `jwk` from the stubbed Access certs endpoint. */
function serveJwks(jwk: JWK, kid = KID) {
  const body = JSON.stringify({
    keys: [{ ...jwk, kid, alg: "RS256", use: "sig" }],
  });
  const fetchMock = vi.fn(async () =>
    new Response(body, {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// The module memoises one JWKS per team domain, so each test needs a fresh
// module instance or the first test's keys would answer for all the others.
async function freshModule() {
  vi.resetModules();
  return import("@/lib/auth/access-jwt");
}

const CONFIG = { teamDomain: TEAM, aud: AUD };

beforeEach(async () => {
  signing = await generateKeyPair("RS256");
  other = await generateKeyPair("RS256");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("accessConfig", () => {
  it("is null when unset, so local dev and tests run without the gate", async () => {
    const { accessConfig } = await freshModule();
    expect(accessConfig({})).toBeNull();
  });

  it("treats a half-configured pair as not configured", async () => {
    const { accessConfig } = await freshModule();
    expect(
      accessConfig({ CF_ACCESS_TEAM_DOMAIN: TEAM }),
    ).toBeNull();
    expect(accessConfig({ CF_ACCESS_AUD: AUD })).toBeNull();
  });

  it("returns both values when present", async () => {
    const { accessConfig } = await freshModule();
    expect(
      accessConfig({
        CF_ACCESS_TEAM_DOMAIN: TEAM,
        CF_ACCESS_AUD: AUD,
      }),
    ).toEqual(CONFIG);
  });

  it("ignores whitespace-only values", async () => {
    const { accessConfig } = await freshModule();
    expect(
      accessConfig({
        CF_ACCESS_TEAM_DOMAIN: "   ",
        CF_ACCESS_AUD: AUD,
      }),
    ).toBeNull();
  });
});

describe("verifyAccessJwt — accepted", () => {
  it("returns the email from a valid token", async () => {
    const { verifyAccessJwt } = await freshModule();
    serveJwks(await exportJWK(signing.publicKey));
    await expect(verifyAccessJwt(await mint(), CONFIG)).resolves.toEqual({
      email: EMAIL,
      isServiceToken: false,
    });
  });

  it("identifies a service token by its common_name", async () => {
    const { verifyAccessJwt } = await freshModule();
    serveJwks(await exportJWK(signing.publicKey));
    await expect(
      verifyAccessJwt(
        await mint({ email: null, commonName: "ci-runner" }),
        CONFIG,
      ),
    ).resolves.toEqual({ email: "ci-runner", isServiceToken: true });
  });

  it("reuses the fetched JWKS across calls", async () => {
    const { verifyAccessJwt } = await freshModule();
    const fetchMock = serveJwks(await exportJWK(signing.publicKey));
    await verifyAccessJwt(await mint(), CONFIG);
    await verifyAccessJwt(await mint(), CONFIG);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("verifyAccessJwt — refused", () => {
  it("refuses a token signed by another key", async () => {
    // The core forgery case: right shape, wrong signer.
    const { verifyAccessJwt } = await freshModule();
    serveJwks(await exportJWK(signing.publicKey));
    await expect(verifyAccessJwt(await mint({ key: other }), CONFIG)).resolves.toBeNull();
  });

  it("refuses a token minted for another Access application", async () => {
    // Validly signed by the same team; only the audience separates the viewer,
    // fair-value and tradelog apps.
    const { verifyAccessJwt } = await freshModule();
    serveJwks(await exportJWK(signing.publicKey));
    const viewerAud =
      "2a1f7810f8171c4cdf9a9e9248a427f9c53358b2a571fe02fadba48264f41c7c";
    await expect(
      verifyAccessJwt(await mint({ aud: viewerAud }), CONFIG),
    ).resolves.toBeNull();
  });

  it("refuses a token from another team", async () => {
    const { verifyAccessJwt } = await freshModule();
    serveJwks(await exportJWK(signing.publicKey));
    await expect(
      verifyAccessJwt(
        await mint({ iss: "https://evil.cloudflareaccess.com" }),
        CONFIG,
      ),
    ).resolves.toBeNull();
  });

  it("refuses an expired token", async () => {
    const { verifyAccessJwt } = await freshModule();
    serveJwks(await exportJWK(signing.publicKey));
    const expired = await mint({
      issuedAt: Math.floor(Date.now() / 1000) - 7200,
      expiresIn: "-1h",
    });
    await expect(verifyAccessJwt(expired, CONFIG)).resolves.toBeNull();
  });

  it("refuses missing, empty and malformed tokens", async () => {
    const { verifyAccessJwt } = await freshModule();
    serveJwks(await exportJWK(signing.publicKey));
    for (const value of [null, undefined, "", "not-a-jwt", "a.b.c", "..."]) {
      await expect(verifyAccessJwt(value, CONFIG)).resolves.toBeNull();
    }
  });

  it("refuses an unsigned alg=none token", async () => {
    // The classic JWT downgrade must never be honoured.
    const { verifyAccessJwt } = await freshModule();
    serveJwks(await exportJWK(signing.publicKey));
    const b64 = (o: unknown) =>
      Buffer.from(JSON.stringify(o)).toString("base64url");
    const forged = `${b64({ alg: "none", kid: KID })}.${b64({
      aud: AUD,
      iss: ISS,
      email: EMAIL,
      exp: Math.floor(Date.now() / 1000) + 3600,
    })}.`;
    await expect(verifyAccessJwt(forged, CONFIG)).resolves.toBeNull();
  });

  it("refuses a token carrying no identity claim", async () => {
    const { verifyAccessJwt } = await freshModule();
    serveJwks(await exportJWK(signing.publicKey));
    await expect(verifyAccessJwt(await mint({ email: null }), CONFIG)).resolves.toBeNull();
  });

  it("fails closed when the JWKS endpoint is unreachable", async () => {
    // If we cannot reach Cloudflare we cannot verify, and an unverified request
    // is not an authenticated one.
    const { verifyAccessJwt } = await freshModule();
    const token = await mint();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    await expect(verifyAccessJwt(token, CONFIG)).resolves.toBeNull();
  });
});
