// Cloudflare Access JWT verification (tradelog #336, mirroring viewer #105).
//
// Google SSO via Cloudflare Access fronts tradelog.kapmancapital.com, but Access
// guards that hostname only. The Fly-assigned kapman-tradelog.fly.dev still
// routes straight to this origin with no Cloudflare in the path, so the app
// cannot treat "a request arrived" as "Access approved it" — and what is behind
// this gate is the trading journal: positions, P&L, account history.
//
// Verifying the JWT Access stamps on every proxied request is what actually
// closes that bypass. An unproxied request carries no such header and cannot
// forge one without Cloudflare's signing key.
//
// `jose` rather than `jsonwebtoken`: this runs in Next.js middleware, whose edge
// runtime provides Web Crypto but not the Node crypto module that
// `jsonwebtoken` needs.

import { createRemoteJWKSet, jwtVerify } from "jose";

export type AccessIdentity = {
  email: string;
  // Cloudflare service tokens carry a common_name and no email; keeping the
  // distinction lets callers tell a person from a machine.
  isServiceToken: boolean;
};

type AccessConfig = {
  teamDomain: string;
  aud: string;
};

// createRemoteJWKSet keeps its own cache and coalesces concurrent fetches, so
// one set per team domain is reused for the life of the process.
const jwkSets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwkSetFor(teamDomain: string) {
  const existing = jwkSets.get(teamDomain);
  if (existing) {
    return existing;
  }
  const created = createRemoteJWKSet(
    new URL(`https://${teamDomain}/cdn-cgi/access/certs`),
  );
  jwkSets.set(teamDomain, created);
  return created;
}

/**
 * The Access settings, or null when the gate is not configured.
 *
 * Unset means local development (or a test run), where no Cloudflare sits in
 * front and requiring a JWT would make the app unrunnable. Production sets both
 * in `fly.toml [env]` — they are public identifiers, not secrets, so committing
 * them is what stops the deployed config from silently going missing.
 */
export function accessConfig(
  env: Record<string, string | undefined> = process.env,
): AccessConfig | null {
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN?.trim();
  const aud = env.CF_ACCESS_AUD?.trim();
  if (!teamDomain || !aud) {
    return null;
  }
  return { teamDomain, aud };
}

/**
 * Verify a Cloudflare Access JWT; resolve the identity, or null if it is not
 * valid.
 *
 * Returns null rather than throwing: the caller is middleware whose only two
 * outcomes are "proceed" and "401", and every failure mode here — bad
 * signature, wrong audience, expired, unreachable JWKS — means the same 401.
 */
export async function verifyAccessJwt(
  token: string | null | undefined,
  config: AccessConfig,
): Promise<AccessIdentity | null> {
  if (!token) {
    return null;
  }
  try {
    const { payload } = await jwtVerify(token, jwkSetFor(config.teamDomain), {
      issuer: `https://${config.teamDomain}`,
      audience: config.aud,
      algorithms: ["RS256"],
    });
    const email = typeof payload.email === "string" ? payload.email : "";
    const commonName =
      typeof payload.common_name === "string" ? payload.common_name : "";
    if (email) {
      return { email, isServiceToken: false };
    }
    if (commonName) {
      return { email: commonName, isServiceToken: true };
    }
    return null;
  } catch {
    // Fail closed: unverified is not authenticated.
    return null;
  }
}

export const ACCESS_JWT_HEADER = "cf-access-jwt-assertion";
