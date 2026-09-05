import { describe, expect, it } from "vitest";
import { buildAggregateScope } from "./aggregate-scope";

describe("buildAggregateScope", () => {
  it("flags mixed entities and environments and unscoped requests", () => {
    const scope = buildAggregateScope([], [
      { accountId: "D-1", paperMoney: true, legalEntity: { slug: "personal" } },
      { accountId: "X-1", paperMoney: false, legalEntity: { slug: "personal" } },
      { accountId: "C-1", paperMoney: false, legalEntity: { slug: "corp" } },
    ]);
    expect(scope).toMatchObject({ mixedEntity: true, mixedEnvironment: true, unscopedRequest: true, legalEntities: ["corp", "personal"], environments: ["LIVE", "PAPER"] });
  });

  it("reports a single-entity live selection as clean and unclassified accounts explicitly", () => {
    const scope = buildAggregateScope(["C-1"], [{ accountId: "C-1", paperMoney: false, legalEntity: null }]);
    expect(scope).toMatchObject({ mixedEntity: false, mixedEnvironment: false, unscopedRequest: false, legalEntities: ["unclassified"], environments: ["LIVE"] });
  });
});
