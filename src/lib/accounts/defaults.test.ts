import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildAccountDefaults, getDefaultStartingCapital } from "./defaults";

describe("getDefaultStartingCapital (#327)", () => {
  it("defaults only the thinkorswim paperMoney platform balance", () => {
    expect(getDefaultStartingCapital("SCHWAB_THINKORSWIM", true)?.toString()).toBe("100000");
  });

  it("never infers a live account's starting capital", () => {
    expect(getDefaultStartingCapital("SCHWAB_THINKORSWIM", false)).toBeNull();
    expect(getDefaultStartingCapital("FIDELITY", false)).toBeNull();
  });
});

describe("buildAccountDefaults", () => {
  it("leaves a live account's starting capital unset for the operator", () => {
    const next = buildAccountDefaults({
      broker: "SCHWAB_THINKORSWIM",
      label: "corporate 12345678SCHW",
      displayLabel: null,
      brokerName: null,
      paperMoney: false,
      startingCapital: null,
    });

    expect(next).toEqual({ displayLabel: "corporate 12345678SCHW", brokerName: "Schwab" });
    expect("startingCapital" in next).toBe(false);
  });

  it("fills the paperMoney balance and never overwrites a set value", () => {
    expect(
      buildAccountDefaults({
        broker: "SCHWAB_THINKORSWIM",
        label: "margin D-68011053",
        displayLabel: "Paper 53",
        brokerName: "Schwab",
        paperMoney: true,
        startingCapital: null,
      }).startingCapital?.toString(),
    ).toBe("100000");

    expect(
      buildAccountDefaults({
        broker: "SCHWAB_THINKORSWIM",
        label: "margin D-68011053",
        displayLabel: "Paper 53",
        brokerName: "Schwab",
        paperMoney: true,
        startingCapital: new Prisma.Decimal(250000),
      }),
    ).toEqual({});
  });
});
