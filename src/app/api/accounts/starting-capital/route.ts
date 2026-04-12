import { detailResponse } from "@/lib/api/responses";
import { parseAccountIds } from "@/lib/api/account-scope";
import { getStartingCapitalSummary } from "@/lib/accounts/starting-capital";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const accountIds = parseAccountIds(url.searchParams.get("accountIds"));
  const summary = await getStartingCapitalSummary(accountIds);
  return detailResponse(summary);
}
