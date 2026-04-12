export function parseAccountIds(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  );
}

export function buildAccountIdWhere(accountIds: string[]): Record<string, unknown> | undefined {
  if (accountIds.length === 0) {
    return undefined;
  }

  return {
    OR: [{ id: { in: accountIds } }, { accountId: { in: accountIds } }],
  };
}

export function applyAccountIdsToSearchParams(params: URLSearchParams, accountIds: string[]): void {
  if (accountIds.length > 0) {
    params.set("accountIds", accountIds.join(","));
  }
}

export function buildAccountScopeWhere(accountIds: string[]): Record<string, unknown> | undefined {
  if (accountIds.length === 0) {
    return undefined;
  }

  return {
    OR: [{ accountId: { in: accountIds } }, { account: { accountId: { in: accountIds } } }],
  };
}
