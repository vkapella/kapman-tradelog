import { describe, expect, it } from "vitest";
import { bearerTokenOk, timingSafeEqual } from "@/lib/auth/bearer";

const TOKEN = "tl_live_0123456789abcdef";

describe("timingSafeEqual", () => {
  it("matches identical strings and rejects different ones", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
});

describe("bearerTokenOk", () => {
  it("accepts the exact token on an api path", () => {
    expect(bearerTokenOk(`Bearer ${TOKEN}`, TOKEN, "/api/recommendations")).toBe(true);
  });

  it("is off entirely when no token is configured", () => {
    expect(bearerTokenOk(`Bearer ${TOKEN}`, undefined, "/api/recommendations")).toBe(false);
    expect(bearerTokenOk(`Bearer ${TOKEN}`, "", "/api/recommendations")).toBe(false);
    expect(bearerTokenOk(`Bearer ${TOKEN}`, "   ", "/api/recommendations")).toBe(false);
  });

  it("rejects wrong, empty, and malformed authorization headers", () => {
    expect(bearerTokenOk(`Bearer ${TOKEN}x`, TOKEN, "/api/recommendations")).toBe(false);
    expect(bearerTokenOk("Bearer ", TOKEN, "/api/recommendations")).toBe(false);
    expect(bearerTokenOk(`bearer ${TOKEN}`, TOKEN, "/api/recommendations")).toBe(false);
    expect(bearerTokenOk(TOKEN, TOKEN, "/api/recommendations")).toBe(false);
    expect(bearerTokenOk(null, TOKEN, "/api/recommendations")).toBe(false);
  });

  it("never authorizes UI paths — the token is an API-only credential", () => {
    expect(bearerTokenOk(`Bearer ${TOKEN}`, TOKEN, "/recommendations")).toBe(false);
    expect(bearerTokenOk(`Bearer ${TOKEN}`, TOKEN, "/today")).toBe(false);
    expect(bearerTokenOk(`Bearer ${TOKEN}`, TOKEN, "/")).toBe(false);
    expect(bearerTokenOk(`Bearer ${TOKEN}`, TOKEN, "/apifake")).toBe(false);
  });

  it("trims configured-token whitespace but not the presented token", () => {
    expect(bearerTokenOk(`Bearer ${TOKEN}`, ` ${TOKEN} `, "/api/recommendations")).toBe(true);
    expect(bearerTokenOk(`Bearer ${TOKEN} `, TOKEN, "/api/recommendations")).toBe(false);
  });
});
