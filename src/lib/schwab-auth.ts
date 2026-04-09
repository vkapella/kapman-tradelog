export class SchwabCredentialsUnavailableError extends Error {
  public readonly code = "SCHWAB_CREDENTIALS_UNAVAILABLE";

  constructor() {
    super("Schwab credentials are not configured.");
  }
}

interface TokenCacheEntry {
  accessToken: string;
  expiresAtMs: number;
}

let cachedToken: TokenCacheEntry | null = null;
let inFlightTokenPromise: Promise<string> | null = null;

function getRequiredCredential(name: "SCHWAB_CLIENT_ID" | "SCHWAB_CLIENT_SECRET" | "SCHWAB_REFRESH_TOKEN"): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new SchwabCredentialsUnavailableError();
  }

  return value;
}

async function requestAccessToken(): Promise<string> {
  const clientId = getRequiredCredential("SCHWAB_CLIENT_ID");
  const clientSecret = getRequiredCredential("SCHWAB_CLIENT_SECRET");
  const refreshToken = getRequiredCredential("SCHWAB_REFRESH_TOKEN");

  const response = await fetch("https://api.schwabapi.com/v1/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(clientId + ":" + clientSecret).toString("base64"),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Unable to refresh Schwab access token.");
  }

  const payload = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!payload.access_token || !payload.expires_in) {
    throw new Error("Invalid token response from Schwab.");
  }

  const now = Date.now();
  cachedToken = {
    accessToken: payload.access_token,
    expiresAtMs: now + payload.expires_in * 1000,
  };

  return cachedToken.accessToken;
}

export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < cachedToken.expiresAtMs - 60_000) {
    return cachedToken.accessToken;
  }

  if (!inFlightTokenPromise) {
    inFlightTokenPromise = requestAccessToken().finally(() => {
      inFlightTokenPromise = null;
    });
  }

  return inFlightTokenPromise;
}
