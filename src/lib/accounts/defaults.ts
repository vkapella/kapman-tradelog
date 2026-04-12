import { Broker, Prisma } from "@prisma/client";

const SCHWAB_STARTING_CAPITAL = new Prisma.Decimal(100000);
const FIDELITY_STARTING_CAPITAL = new Prisma.Decimal(0);

export interface AccountDefaultsInput {
  broker: Broker;
  label: string;
  displayLabel: string | null;
  brokerName: string | null;
  startingCapital: Prisma.Decimal | null;
}

export function getBrokerDisplayName(broker: Broker): string {
  return broker === "FIDELITY" ? "Fidelity" : "Schwab";
}

export function getDefaultStartingCapital(broker: Broker): Prisma.Decimal {
  return broker === "FIDELITY" ? FIDELITY_STARTING_CAPITAL : SCHWAB_STARTING_CAPITAL;
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
    next.startingCapital = getDefaultStartingCapital(input.broker);
  }

  return next;
}
