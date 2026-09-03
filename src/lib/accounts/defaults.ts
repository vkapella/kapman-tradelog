import { Broker, Prisma } from "@prisma/client";

/**
 * thinkorswim's paperMoney platform seeds every simulated account with
 * $100,000 — a platform fact, so it is the one starting capital that can be
 * defaulted. A live account's starting capital is never inferred (#327): it is
 * left null until the operator sets it (0 for an account that opened empty
 * and was funded by wires, which then arrive as TRANSFER_IN cash events).
 */
const PAPER_MONEY_STARTING_CAPITAL = new Prisma.Decimal(100000);

export interface AccountDefaultsInput {
  broker: Broker;
  label: string;
  displayLabel: string | null;
  brokerName: string | null;
  paperMoney: boolean;
  startingCapital: Prisma.Decimal | null;
}

export function getBrokerDisplayName(broker: Broker): string {
  return broker === "FIDELITY" ? "Fidelity" : "Schwab";
}

export function getDefaultStartingCapital(broker: Broker, paperMoney: boolean): Prisma.Decimal | null {
  return broker === "SCHWAB_THINKORSWIM" && paperMoney ? PAPER_MONEY_STARTING_CAPITAL : null;
}

export function buildAccountDefaults(input: AccountDefaultsInput): {
  displayLabel?: string;
  brokerName?: string;
  startingCapital?: Prisma.Decimal;
} {
  const next: {
    displayLabel?: string;
    brokerName?: string;
    startingCapital?: Prisma.Decimal;
  } = {};

  if (input.displayLabel === null) {
    next.displayLabel = input.label;
  }

  if (input.brokerName === null) {
    next.brokerName = getBrokerDisplayName(input.broker);
  }

  if (input.startingCapital === null) {
    const defaultStartingCapital = getDefaultStartingCapital(input.broker, input.paperMoney);
    if (defaultStartingCapital !== null) {
      next.startingCapital = defaultStartingCapital;
    }
  }

  return next;
}
