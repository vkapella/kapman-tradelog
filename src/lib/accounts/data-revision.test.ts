import { describe, expect, it, vi } from "vitest";
import { bumpAccountDataRevision, compareDataRevisions, serializeDataRevision } from "@/lib/accounts/data-revision";

describe("bumpAccountDataRevision", () => {
  it("increments the revision for each distinct account in one statement", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    await bumpAccountDataRevision({ account: { updateMany } } as never, ["a", "b", "a", " "]);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["a", "b"] } },
      data: { dataRevision: { increment: 1 } },
    });
  });

  it("does nothing for an empty account list", async () => {
    const updateMany = vi.fn();
    await bumpAccountDataRevision({ account: { updateMany } } as never, ["", "  "]);
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe("serializeDataRevision", () => {
  it("serializes BigInt to string and passes null through", () => {
    expect(serializeDataRevision(BigInt("9007199254740993"))).toBe("9007199254740993");
    expect(serializeDataRevision(null)).toBeNull();
    expect(serializeDataRevision(undefined)).toBeNull();
  });
});

describe("compareDataRevisions", () => {
  it("orders numerically beyond Number precision", () => {
    expect(compareDataRevisions("9007199254740993", "9007199254740992")).toBe(1);
    expect(compareDataRevisions("2", "10")).toBe(-1);
    expect(compareDataRevisions("7", "7")).toBe(0);
  });

  it("returns null when either side is missing or malformed — callers must fall back, never assume equality", () => {
    expect(compareDataRevisions(null, "1")).toBeNull();
    expect(compareDataRevisions("1", undefined)).toBeNull();
    expect(compareDataRevisions("not-a-number", "1")).toBeNull();
  });
});
