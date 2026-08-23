// Machine-caller surface (tradelog #332, mirroring viewer #89): an optional
// bearer token in API_BEARER_TOKEN is accepted on /api routes as an
// alternative to basic auth. UI pages stay basic-auth-only, and an unset
// token means the bearer path is off entirely.

const BEARER_PREFIX = "Bearer ";
const API_PATH_PREFIX = "/api/";

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function bearerTokenOk(
  authorizationHeader: string | null,
  expectedToken: string | undefined,
  pathname: string,
): boolean {
  const token = expectedToken?.trim();
  if (!token) {
    return false;
  }

  if (!pathname.startsWith(API_PATH_PREFIX)) {
    return false;
  }

  if (!authorizationHeader?.startsWith(BEARER_PREFIX)) {
    return false;
  }

  return timingSafeEqual(authorizationHeader.slice(BEARER_PREFIX.length), token);
}
