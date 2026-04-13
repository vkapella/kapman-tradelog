import { NextResponse } from "next/server";
import { getCachedOptionQuote, unavailableOptionQuote } from "@/lib/mcp/option-quote-cache";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = (url.searchParams.get("symbol") ?? "").trim().toUpperCase();
  const strikeRaw = (url.searchParams.get("strike") ?? "").trim();
  const expDate = (url.searchParams.get("expDate") ?? "").trim();
  const contractType = (url.searchParams.get("contractType") ?? "").trim().toUpperCase();
  const forceRefresh = url.searchParams.get("refresh") === "1";

  if (!symbol || !expDate || (contractType !== "CALL" && contractType !== "PUT")) {
    return NextResponse.json(unavailableOptionQuote());
  }

  const responsePayload = await getCachedOptionQuote(
    {
      symbol,
      strike: strikeRaw,
      expDate,
      contractType,
    },
    forceRefresh,
  );

  return NextResponse.json(responsePayload);
}
