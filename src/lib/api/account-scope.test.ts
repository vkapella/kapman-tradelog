import { describe, expect, it } from "vitest";
import { applyAccountIdsToSearchParams, buildAccountScopeWhere, parseAccountIds } from "./account-scope";

describe("parseAccountIds", () => {
  it("parses, trims, de-duplicates, and omits empty values", () => {
    expect(parseAccountIds("  acct-1,acct-2,acct-1,,  ,acct-3 ")).toEqual(["acct-1", "acct-2", "acct-3"]);
  });

  it("returns an empty array when query value is null", () => {
    expect(parseAccountIds(null)).toEqual([]);
  });
});

describe("applyAccountIdsToSearchParams", () => {
  it("writes accountIds when values are provided", () => {
    const params = new URLSearchParams();
    applyAccountIdsToSearchParams(params, ["acct-1", "acct-2"]);
    expect(params.get("accountIds")).toBe("acct-1,acct-2");
  });

  it("does not write accountIds for empty selections", () => {
    const params = new URLSearchParams();
    applyAccountIdsToSearchParams(params, []);
    expect(params.get("accountIds")).toBeNull();
  });
});

describe("buildAccountScopeWhere", () => {
  it("builds OR scope for internal and external account ids", () => {
    expect(buildAccountScopeWhere(["acct-1", "acct-2"])).toEqual({
      OR: [{ accountId: { in: ["acct-1", "acct-2"] } }, { account: { accountId: { in: ["acct-1", "acct-2"] } } }],
    });
  });
});
