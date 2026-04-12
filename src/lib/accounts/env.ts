let warned = false;

export function warnDeprecatedStartingCapitalEnvVar(): void {
  if (warned) {
    return;
  }

  const value = process.env.STARTING_CAPITAL?.trim();
  if (!value) {
    return;
  }

  warned = true;
  console.warn("STARTING_CAPITAL env var is deprecated. Use the Accounts page to set per-account starting capital.");
}
