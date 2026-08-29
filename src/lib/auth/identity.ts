// Profile identity propagation (#344).
//
// Middleware is the ONLY writer of PROFILE_IDENTITY_HEADER: it strips any
// inbound value before evaluating a single allow path, then re-sets it for a
// verified human (or the dev identity when the Access gate is unconfigured).
// Route handlers must read identity exclusively through getProfileIdentity —
// never from query params or request bodies.
//
// PROFILE_EXPECTED_IDENTITY_HEADER is the opposite: deliberately
// client-written and untrusted. The profile routes compare it against the
// trusted identity and reject on mismatch (IDENTITY_CHANGED); it is never an
// addressing or authorization input, so spoofing it can only cause a
// rejection. It exists because a tab can stay open while the shared Cloudflare
// Access session switches users underneath it.

export const PROFILE_IDENTITY_HEADER = "x-kapman-user";
export const PROFILE_EXPECTED_IDENTITY_HEADER = "x-kapman-expected-user";
export const DEV_IDENTITY = "dev@local";

/**
 * One normalization for every consumer — header propagation, database
 * addressing, guard comparison, and cache/journal addressing. Case or
 * whitespace variants of the same email must never fork profiles.
 */
export function normalizeIdentity(raw: string | null | undefined): string | null {
  const normalized = raw?.trim().toLowerCase();
  return normalized ? normalized : null;
}

/** The trusted middleware-written identity, or null for machine callers. */
export function getProfileIdentity(request: Request): string | null {
  return normalizeIdentity(request.headers.get(PROFILE_IDENTITY_HEADER));
}

/** The client's expected-identity guard value; untrusted, rejection-only. */
export function getExpectedIdentity(request: Request): string | null {
  return normalizeIdentity(request.headers.get(PROFILE_EXPECTED_IDENTITY_HEADER));
}
