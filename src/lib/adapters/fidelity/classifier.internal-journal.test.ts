import { describe, expect, it } from "vitest";
import { classifyAction } from "./classifier";

describe("classifyAction internal journals (#369)", () => {
  it("classifies cash/margin account-type journals as INTERNAL_JOURNAL cash events instead of UNKNOWN", () => {
    expect(classifyAction("JOURNALED JNL VS A/C TYPES (Cash)")).toEqual({ kind: "CASH_EVENT", cashEventType: "INTERNAL_JOURNAL" });
    expect(classifyAction("JOURNALED JNL VS A/C TYPES (Margin)")).toEqual({ kind: "CASH_EVENT", cashEventType: "INTERNAL_JOURNAL" });
  });

  it("leaves genuinely unknown actions unknown", () => {
    expect(classifyAction("SOMETHING FIDELITY HAS NOT SHOWN US")).toEqual({ kind: "UNKNOWN" });
  });
});
