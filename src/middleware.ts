import { NextResponse, type NextRequest } from "next/server";
import { bearerTokenOk } from "@/lib/auth/bearer";
import {
  ACCESS_JWT_HEADER,
  accessConfig,
  verifyAccessJwt,
} from "@/lib/auth/access-jwt";

// Cloudflare Access gate for the whole app (#336, replacing HTTP Basic auth).
//
// Google SSO happens at Cloudflare in front of tradelog.kapmancapital.com, which
// stamps a signed JWT on every proxied request. This middleware verifies it.
//
// That verification is not belt-and-braces: Access guards the proxied hostname
// only, and kapman-tradelog.fly.dev reaches this origin with no Cloudflare in
// the path. Basic auth used to be the only thing holding that door shut, so the
// gate was replaced rather than removed — what is behind it is the trading
// journal, positions and P&L included.
//
// Configuration comes from CF_ACCESS_TEAM_DOMAIN + CF_ACCESS_AUD (fly.toml
// [env]; both are public identifiers, not secrets). When either is unset the
// gate is bypassed, so local development, docker compose, and tests run without
// authentication — the same bypass the basic-auth gate had.
//
// Machine callers (#332): when API_BEARER_TOKEN is set,
// `Authorization: Bearer <token>` is still accepted on /api routes. Access
// authenticates browsers via Google and cannot authenticate a curl, and this is
// how kapman-kb's agent sessions reach the journal.
//
// `/api/health` is exempt so Fly's health check — which hits the origin
// directly and carries no JWT — can reach the app. Gating it would fail every
// check and roll the deploy back. Next.js static assets are excluded via the
// matcher below.

const HEALTH_PATH = "/api/health";

function unauthorized(): NextResponse {
  return new NextResponse(
    "Cloudflare Access sign-in required. Open this app at " +
      "https://tradelog.kapmancapital.com/ — reaching the origin directly " +
      "bypasses sign-in and is refused.",
    { status: 401, headers: { "content-type": "text/plain; charset=utf-8" } },
  );
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const access = accessConfig();

  // Access not configured -> allow through (local dev / tests / compose).
  if (!access) {
    return NextResponse.next();
  }

  // Let Fly's health check through without credentials.
  if (request.nextUrl.pathname === HEALTH_PATH) {
    return NextResponse.next();
  }

  // Machine callers: bearer token on /api routes only.
  if (
    bearerTokenOk(
      request.headers.get("authorization"),
      process.env.API_BEARER_TOKEN,
      request.nextUrl.pathname,
    )
  ) {
    return NextResponse.next();
  }

  const identity = await verifyAccessJwt(
    request.headers.get(ACCESS_JWT_HEADER),
    access,
  );
  if (!identity) {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next.js internals and common static asset files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
