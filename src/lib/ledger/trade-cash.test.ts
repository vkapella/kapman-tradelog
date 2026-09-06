import { describe, expect, it } from "vitest";
import { grossTradeValue, settledNetTradeValue, tradeCashDelta, tradingFee } from "./trade-cash";

const fidelitySell = { broker: "FIDELITY", assetClass: "OPTION", side: "SELL", quantity: "1", price: "0.11", netAmount: "10.97" };
const fidelityBuy = { broker: "FIDELITY", assetClass: "OPTION", side: "BUY", quantity: "1", price: "0.55", netAmount: "-55.03" };
const tosSell = { broker: "SCHWAB_THINKORSWIM", assetClass: "OPTION", side: "SELL", quantity: "2", price: "1.84", netAmount: "1.84" };

describe("trade-cash", () => {
  it("prices gross as quantity × price × multiplier", () => {
    expect(grossTradeValue(fidelitySell)).toBeCloseTo(11, 6);
    expect(grossTradeValue({ ...tosSell, assetClass: "EQUITY" })).toBeCloseTo(3.68, 6);
    expect(grossTradeValue({ ...fidelitySell, price: null })).toBeNull();
  });

  it("reads a settled amount only for brokers that store one", () => {
    expect(settledNetTradeValue(fidelitySell)).toBeCloseTo(10.97, 6);
    expect(settledNetTradeValue(fidelityBuy)).toBeCloseTo(55.03, 6);
    expect(settledNetTradeValue(tosSell)).toBeNull();
    expect(settledNetTradeValue({ ...fidelitySell, netAmount: null })).toBeNull();
  });

  it("signs cash by side and prefers the settled amount (#372)", () => {
    expect(tradeCashDelta(fidelitySell)).toBeCloseTo(10.97, 6);
    expect(tradeCashDelta(fidelityBuy)).toBeCloseTo(-55.03, 6);
    expect(tradeCashDelta(tosSell)).toBeCloseTo(368, 6);
    expect(tradeCashDelta({ ...fidelityBuy, side: null })).toBe(0);
  });

  it("treats in-kind receives as cash-neutral with no fee", () => {
    const acat = { broker: "FIDELITY", assetClass: "EQUITY", side: "BUY", quantity: "100", price: "89.81", netAmount: "8981", rawRowJson: { rawAction: "TRANSFER OF ASSETS ACAT RECEIVE (XLE)" } };
    expect(tradeCashDelta(acat)).toBe(0);
    expect(tradingFee(acat)).toBe(0);
  });

  it("reports the fee as the positive gap between gross and settled on either side", () => {
    expect(tradingFee(fidelitySell)).toBeCloseTo(0.03, 6);
    expect(tradingFee(fidelityBuy)).toBeCloseTo(0.03, 6);
    expect(tradingFee(tosSell)).toBe(0);
    expect(tradingFee({ ...fidelitySell, netAmount: null })).toBe(0);
  });
});
