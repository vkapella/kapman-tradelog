import type { AggregateScope } from "@/types/api";

export interface ScopeAccountLike {
  accountId: string;
  paperMoney?: boolean | null;
  legalEntity?: { slug: string } | null;
}

/**
 * Describe the entity/environment composition of an aggregate so mixed
 * paper+live or cross-entity sums are never mistaken for one entity's
 * performance (#364). Accounts without a legal entity report `unclassified`.
 */
export function buildAggregateScope(requestedAccountIds: string[], accounts: ScopeAccountLike[]): AggregateScope {
  const legalEntities = Array.from(new Set(accounts.map((account) => account.legalEntity?.slug ?? "unclassified"))).sort();
  const environments = Array.from(new Set(accounts.map((account) => (account.paperMoney ? "PAPER" : "LIVE")))).sort() as Array<"LIVE" | "PAPER">;
  return {
    requestedAccountIds: [...requestedAccountIds],
    resolvedAccountIds: accounts.map((account) => account.accountId),
    legalEntities,
    environments,
    mixedEntity: legalEntities.length > 1,
    mixedEnvironment: environments.length > 1,
    unscopedRequest: requestedAccountIds.length === 0,
  };
}
