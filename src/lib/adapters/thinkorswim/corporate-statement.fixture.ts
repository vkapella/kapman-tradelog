/**
 * Synthetic thinkorswim statement for a LIVE business account, section for
 * section the shape of the first real corporate export (2026-08-27, #327/#348):
 * no paperMoney banner, "(Corporate)" account type, funding as JRN/WIN rows
 * swept the same day into SNSXX (Spread=FUND), a Futures "Total Cash" line the
 * Account Summary lacks, and the statement NLV.
 *
 * Real statements are gitignored (`**\/*[Aa]ccount*.csv`), so the test data is
 * synthetic: same layout, round numbers, redacted account id.
 */
export const CORPORATE_STATEMENT_ACCOUNT_ID = "12345678SCHW";
export const CORPORATE_STATEMENT_WIRE_ONE = 50000;
export const CORPORATE_STATEMENT_WIRE_TWO = 49980;
export const CORPORATE_STATEMENT_NLV = CORPORATE_STATEMENT_WIRE_ONE + CORPORATE_STATEMENT_WIRE_TWO;

function money(value: number): string {
  return `"${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}"`;
}

export function buildCorporateStatementCsv(): string {
  const one = CORPORATE_STATEMENT_WIRE_ONE;
  const two = CORPORATE_STATEMENT_WIRE_TWO;
  return [
    `Account Statement for ${CORPORATE_STATEMENT_ACCOUNT_ID} (Corporate) since 7/29/26 through 8/27/26`,
    "",
    "Cash Balance",
    "DATE,TIME,TYPE,REF #,DESCRIPTION,Misc Fees,Commissions & Fees,AMOUNT,BALANCE",
    "7/29/26,01:00:00,BAL,,Cash balance at the start of business day 29.07 CST,,,,0.00",
    "8/25/26,01:00:00,BAL,,Cash balance at the start of business day 25.08 CST,,,,0.00",
    "8/26/26,01:00:00,BAL,,Cash balance at the start of business day 26.08 CST,,,,0.00",
    `8/26/26,13:24:59,JRN,="129145481101",FUNDS RECEIVED ${one}.0 US$,,,${money(one)},${money(one)}`,
    `8/26/26,20:22:37,TRD,="129181781548",BOT ${one}.0 SNSXX UPON ,,,${money(-one)},0.00`,
    "8/27/26,01:00:00,BAL,,Cash balance at the start of business day 27.08 CST,,,,0.00",
    `8/27/26,14:40:12,WIN,="129287438901",WIRED FUNDS RECEIVED ${two}.0 US$,,,${money(two)},${money(two)}`,
    `8/27/26,20:39:34,TRD,="129308084328",BOT ${two}.0 SNSXX UPON ,,,${money(-two)},0.00`,
    ",,,,TOTAL,,,,$0.00",
    "",
    "Futures Statements",
    "Trade Date,Exec Date,Exec Time,Type,Ref #,Description,Misc Fees,Commissions & Fees,Amount,Balance",
    "8/27/26,8/27/26,01:00:00,BAL,--,Futures cash balance at the start of business day 27.08 CST,--,--,--,0.00",
    "",
    " ",
    "Total Cash $0.00",
    "",
    "",
    "Forex Statements",
    ",Date,Time,Type,Ref #,Description,Commissions & Fees,Amount,Amount(USD),Balance",
    "",
    "Account Order History",
    "Notes,,Time Placed,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,PRICE,,TIF,Status",
    `,,8/27/26 15:30:28,FUND,BUY,+1,TO OPEN,SNSXX,,,FUND,${two}.00,AMT,DAY,FILLED`,
    `,,8/26/26 15:48:16,FUND,BUY,+1,TO OPEN,SNSXX,,,FUND,${one}.00,AMT,DAY,FILLED`,
    "",
    "Account Trade History",
    ",Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,Price,Net Price,Order Type",
    `,8/27/26 20:39:34,FUND,BUY,+${two},TO OPEN,SNSXX,,,FUND,1.00,1.00,AMT`,
    `,8/26/26 20:22:37,FUND,BUY,+${one},TO OPEN,SNSXX,,,FUND,1.00,1.00,AMT`,
    "",
    "Others",
    "Symbol,Description,Qty,Trade Price,Mark,Mark Value",
    `SNSXX,SCHWAB US TREASURY MONEY INVESTOR,+${one + two},1.00,1.00,"$${money(one + two).slice(1)}`,
    `,OVERALL TOTALS,,,,"$${money(one + two).slice(1)}`,
    "",
    "Profits and Losses",
    "Symbol,Description,P/L Open,P/L %,P/L Day,P/L YTD,P/L Diff,Mark Value",
    `SNSXX,SCHWAB US TREASURY MONEY INVESTOR,$0.00,0.00%,$0.00,$0.00,N/A,"$${money(one + two).slice(1)}`,
    "",
    "Account Summary",
    `Net Liquidating Value,"$${money(one + two).slice(1)}`,
    "Stock Buying Power,$0.00",
    `Option Buying Power,"($${money(one).slice(1)})"`,
    "Intraday Buying Power,N/A",
    "Equity Commissions & Fees YTD,$0.00",
    "Futures Commissions & Fees YTD,$0.00",
    "Crypto Trading Fees YTD,N/A",
    "Total Commissions & Fees YTD,$0.00",
    "",
  ].join("\n");
}
