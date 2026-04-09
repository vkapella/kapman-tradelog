import { NextResponse } from "next/server";
import type { OptionQuoteRecord, QuoteUnavailableResponse } from "@/types/api";
import { SchwabCredentialsUnavailableError, getAccessToken } from "@/lib/schwab-auth";

function unavailable(): QuoteUnavailableResponse {
  return { error: "unavailable" };
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getOptionContract(
  map: Record<string, Record<string, Array<Record<string, unknown>>>>,
  expDate: string,
  strike: number,
): Record<string, unknown> | null {
  for (const [expKey, strikeMap] of Object.entries(map)) {
    if (!expKey.startsWith(expDate + ":")) {
      continue;
    }

    for (const [strikeKey, contracts] of Object.entries(strikeMap)) {
      const strikeNumber = Number(strikeKey);
      if (Number.isFinite(strikeNumber) && Math.abs(strikeNumber - strike) < 0.0001 && contracts.length > 0) {
        return contracts[0];
      }
    }
  }

  return null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = (url.searchParams.get("symbol") ?? "").trim().toUpperCase();
  const strikeRaw = (url.searchParams.get("strike") ?? "").trim();
  const expDate = (url.searchParams.get("expDate") ?? "").trim();
  const contractType = (url.searchParams.get("contractType") ?? "").trim().toUpperCase();
  const strike = Number(strikeRaw);

  if (!symbol || !expDate || !Number.isFinite(strike) || (contractType !== "CALL" && contractType !== "PUT")) {
    return NextResponse.json(unavailable());
  }

  try {
    const token = await getAccessToken();
    const upstream = await fetch(
      `https://api.schwabapi.com/marketdata/v1/chains?symbol=${encodeURIComponent(symbol)}&strikeCount=50&fromDate=${encodeURIComponent(
        expDate,
      )}&toDate=${encodeURIComponent(expDate)}&contractType=${contractType}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );

    if (!upstream.ok) {
      return NextResponse.json(unavailable());
    }

    const payload = (await upstream.json()) as {
      callExpDateMap?: Record<string, Record<string, Array<Record<string, unknown>>>>;
      putExpDateMap?: Record<string, Record<string, Array<Record<string, unknown>>>>;
    };

    const expMap = contractType === "CALL" ? payload.callExpDateMap : payload.putExpDateMap;
    if (!expMap) {
      return NextResponse.json(unavailable());
    }

    const contract = getOptionContract(expMap, expDate, strike);
    if (!contract) {
      return NextResponse.json(unavailable());
    }

    const mark = numberOrNull(contract.mark) ?? numberOrNull(contract.markChange) ?? numberOrNull(contract.last);
    const bid = numberOrNull(contract.bid);
    const ask = numberOrNull(contract.ask);
    const delta = numberOrNull(contract.delta);
    const theta = numberOrNull(contract.theta);
    const iv = numberOrNull(contract.volatility);
    const dte = numberOrNull(contract.daysToExpiration);

    if (mark === null || bid === null || ask === null || delta === null || theta === null || iv === null || dte === null) {
      return NextResponse.json(unavailable());
    }

    const responsePayload: OptionQuoteRecord = {
      mark,
      bid,
      ask,
      delta,
      theta,
      iv,
      dte,
      inTheMoney: Boolean(contract.inTheMoney),
    };

    return NextResponse.json(responsePayload);
  } catch (error) {
    if (error instanceof SchwabCredentialsUnavailableError) {
      return NextResponse.json(unavailable());
    }

    return NextResponse.json(unavailable());
  }
}
