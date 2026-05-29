import { NextResponse, type NextRequest } from "next/server";

// Minimal HTTP Basic Auth gate for the whole app.
//
// Credentials come from environment variables and are never committed:
//   BASIC_AUTH_USER, BASIC_AUTH_PASSWORD
//
// When either variable is unset the gate is bypassed, so local development,
// docker compose, and tests run without authentication. In production (Fly)
// set both via `fly secrets set` to require a login on every request.
//
// `/api/health` is intentionally exempt so the Fly health check can reach the
// app, and Next.js static assets are excluded via the matcher below.

const HEALTH_PATH = "/api/health";

function unauthorized(): NextResponse {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="KapMan Trading Journal", charset="UTF-8"',
    },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function middleware(request: NextRequest): NextResponse {
  const expectedUser = process.env.BASIC_AUTH_USER?.trim();
  const expectedPassword = process.env.BASIC_AUTH_PASSWORD;

  // Auth not configured -> allow through (local dev / tests / compose).
  if (!expectedUser || !expectedPassword) {
    return NextResponse.next();
  }

  // Let Fly's health check through without credentials.
  if (request.nextUrl.pathname === HEALTH_PATH) {
    return NextResponse.next();
  }

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) {
    return unauthorized();
  }

  let decoded = "";
  try {
    decoded = atob(header.slice("Basic ".length));
  } catch {
    return unauthorized();
  }

  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex === -1) {
    return unauthorized();
  }

  const user = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  const userOk = timingSafeEqual(user, expectedUser);
  const passwordOk = timingSafeEqual(password, expectedPassword);
  if (!userOk || !passwordOk) {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next.js internals and common static asset files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
