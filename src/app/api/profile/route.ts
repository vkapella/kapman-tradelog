// Per-user profile routes (#344). Identity-only addressing: the database is
// addressed EXCLUSIVELY by the trusted middleware x-kapman-user identity.
// The client-supplied x-kapman-expected-user value is a mismatch guard whose
// sole possible effect is rejection (IDENTITY_CHANGED) — it closes the
// stale-tab race where the shared Cloudflare Access session switches users
// underneath an open tab, whose later autosave would otherwise write the old
// user's pending settings into the new user's profile.

import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { serializeDataRevision } from "@/lib/accounts/data-revision";
import { getExpectedIdentity, getProfileIdentity } from "@/lib/auth/identity";
import { prisma } from "@/lib/db/prisma";
import {
  PROFILE_MAX_BYTES,
  classifyStoredSettings,
  cloneDefaultProfile,
  profilePatchSchema,
} from "@/lib/profile/schema";
import { putProfile, type ProfileStore } from "@/lib/profile/store";
import type {
  ApiDetailResponse,
  ApiErrorResponse,
  ProfileGetResponse,
  ProfilePutResponse,
  ProfileSettingsV1,
} from "@/types/api";

// Always query the live database at request time; never statically prerender
// this handler at build (no DB is available then).
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "private, no-store" };

function jsonDetail<T>(data: T, status = 200): NextResponse {
  const body: ApiDetailResponse<T> = { data };
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function jsonError(code: string, message: string, status: number, details: string[] = []): NextResponse {
  const body: ApiErrorResponse = { error: { code, message, details } };
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/**
 * Resolve the trusted identity and check the client's expected-identity guard.
 * The guard is compared BEFORE any database access and is never used for
 * lookup, addressing, or authorization.
 */
function requireIdentity(request: Request): { email: string } | { response: NextResponse } {
  const email = getProfileIdentity(request);
  if (!email) {
    // Service tokens and bearer callers land here — machines have no profile.
    return { response: jsonError("FORBIDDEN", "Profile routes require a human identity.", 403) };
  }

  const expected = getExpectedIdentity(request);
  if (!expected || expected !== email) {
    return {
      response: jsonError(
        "IDENTITY_CHANGED",
        "The signed-in identity no longer matches this tab. Reload to continue.",
        409,
      ),
    };
  }

  return { email };
}

const prismaStore: ProfileStore = {
  async find(email) {
    return prisma.userProfile.findUnique({
      where: { email },
      select: { email: true, settings: true, revision: true, updatedAt: true },
    });
  },
  async create(email, settings) {
    return prisma.userProfile.create({
      data: { email, settings: settings as unknown as Prisma.InputJsonValue },
      select: { email: true, settings: true, revision: true, updatedAt: true },
    });
  },
  async casUpdate(email, expectedRevision, settings) {
    const result = await prisma.userProfile.updateMany({
      where: { email, revision: expectedRevision },
      data: { settings: settings as unknown as Prisma.InputJsonValue, revision: { increment: 1 } },
    });
    return result.count;
  },
};

export async function GET(request: Request): Promise<NextResponse> {
  const identity = requireIdentity(request);
  if ("response" in identity) {
    return identity.response;
  }

  const row = await prismaStore.find(identity.email);

  let settings: ProfileSettingsV1 = cloneDefaultProfile();
  let isDefault = true;
  let writable = true;
  if (row) {
    const stored = classifyStoredSettings(row.settings);
    if (stored.kind === "valid") {
      settings = stored.settings;
      isDefault = false;
    } else if (stored.kind === "unsupported") {
      writable = false;
    }
    // "malformed" keeps defaults, isDefault true, writable true — the next
    // write merges into DEFAULT_PROFILE via CAS against this row's revision.
  }

  const payload: ProfileGetResponse = {
    email: identity.email,
    settings,
    isDefault,
    writable,
    revision: row ? (serializeDataRevision(row.revision) ?? "0") : "0",
    updatedAt: row ? row.updatedAt.toISOString() : null,
  };

  return jsonDetail(payload);
}

export async function PUT(request: Request): Promise<NextResponse> {
  const identity = requireIdentity(request);
  if ("response" in identity) {
    return identity.response;
  }

  // Byte cap on the RAW body before JSON.parse — Content-Length can lie.
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).length > PROFILE_MAX_BYTES) {
    return jsonError("PAYLOAD_TOO_LARGE", "Profile patch exceeds 64 KiB.", 413);
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return jsonError("VALIDATION_ERROR", "Request body is not valid JSON.", 400);
  }

  const patchCandidate =
    typeof parsedBody === "object" && parsedBody !== null ? (parsedBody as { patch?: unknown }).patch : undefined;
  const patch = profilePatchSchema.safeParse(patchCandidate);
  if (!patch.success) {
    return jsonError(
      "VALIDATION_ERROR",
      "Invalid profile patch.",
      400,
      patch.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    );
  }

  const result = await putProfile(prismaStore, identity.email, patch.data);
  switch (result.kind) {
    case "ok": {
      const payload: ProfilePutResponse = {
        settings: result.settings,
        revision: serializeDataRevision(result.revision) ?? "0",
        updatedAt: result.updatedAt.toISOString(),
      };
      return jsonDetail(payload);
    }
    case "unsupported_version":
      return jsonError(
        "UNSUPPORTED_PROFILE_VERSION",
        "The stored profile was written by a newer app version and is read-only here.",
        409,
      );
    case "too_large":
      return jsonError("PAYLOAD_TOO_LARGE", "Merged profile document exceeds 64 KiB.", 413);
    case "conflict":
      return jsonError("CONFLICT", "Concurrent profile writes exhausted retries; try again.", 409);
  }
}
