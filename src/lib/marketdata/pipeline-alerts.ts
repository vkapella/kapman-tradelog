import { PipelineAlertLifecycle, PipelineRunStatus, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export const DEFAULT_FRESHNESS_LAG_DAYS = 4;
export const DEFAULT_LOCK_CONTENTION_THRESHOLD = 3;
export const DEFAULT_ALERT_REPEAT_MINUTES = 720;

const DAY_MS = 24 * 60 * 60 * 1000;

export type PipelineAlertKey = "run-failed" | "run-abandoned" | "lock-contention" | "freshness-lag";

export type PipelineAlertSeverity = "critical" | "warning" | "info";

export interface PipelineAlertConfig {
  webhookUrl: string;
  /// Explicit payload shape; inferred from the webhook host when unset.
  webhookFormat?: string;
  freshnessLagDays: number;
  lockContentionThreshold: number;
  repeatMinutes: number;
  timeoutMs: number;
}

export interface PipelineAlert {
  key: PipelineAlertKey;
  severity: PipelineAlertSeverity;
  title: string;
  detail: string;
  /// Changes only when the underlying condition materially changes.
  signature: string;
}

export interface PipelineFreshness {
  latestEquityMarkDate: Date | null;
  latestOptionMarkDate: Date | null;
  latestValueSnapshotDate: Date | null;
}

export interface EvaluatePipelineAlertsInput {
  now: Date;
  runStatus: PipelineRunStatus;
  errorMessage?: string | null;
  recoveredAbandonedCount?: number;
  consecutiveLockedCount?: number;
  freshness: PipelineFreshness;
  config: PipelineAlertConfig;
}

export interface PipelineAlertEvaluation {
  firing: PipelineAlert[];
  /// Keys whose condition is confirmed clear on this run.
  resolved: PipelineAlertKey[];
}

export interface PipelineAlertStateRecord {
  alertKey: string;
  state: PipelineAlertLifecycle;
  signature: string | null;
  lastSentAt: Date;
}

export interface PipelineAlertStateStore {
  load(jobName: string): Promise<PipelineAlertStateRecord[]>;
  markFiring(jobName: string, alert: PipelineAlert, now: Date): Promise<void>;
  markResolved(jobName: string, key: PipelineAlertKey, now: Date): Promise<void>;
}

export interface PipelineAlertTransport {
  send(payload: PipelineAlertPayload): Promise<void>;
}

export interface PipelineAlertPayload {
  jobName: string;
  event: "firing" | "resolved";
  key: PipelineAlertKey;
  severity: PipelineAlertSeverity;
  title: string;
  detail: string;
  occurredAt: string;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim().length === 0) {
    return fallback;
  }
  const parsed = Number(value.trim());
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

/**
 * Alerting is entirely optional. Without a webhook URL this returns null and
 * every downstream alert step becomes a no-op, leaving the pipeline unchanged.
 */
export function resolveAlertConfig(env: Record<string, string | undefined> = process.env): PipelineAlertConfig | null {
  const webhookUrl = env.PIPELINE_ALERT_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    return null;
  }

  return {
    webhookUrl,
    webhookFormat: env.PIPELINE_ALERT_FORMAT,
    freshnessLagDays: parsePositiveInteger(env.PIPELINE_ALERT_FRESHNESS_LAG_DAYS, DEFAULT_FRESHNESS_LAG_DAYS),
    lockContentionThreshold: parsePositiveInteger(
      env.PIPELINE_ALERT_LOCK_CONTENTION_THRESHOLD,
      DEFAULT_LOCK_CONTENTION_THRESHOLD,
    ),
    repeatMinutes: parsePositiveInteger(env.PIPELINE_ALERT_REPEAT_MINUTES, DEFAULT_ALERT_REPEAT_MINUTES),
    timeoutMs: parsePositiveInteger(env.PIPELINE_ALERT_TIMEOUT_MS, 10_000),
  };
}

/**
 * Whether the dead-man's-switch heartbeat is configured. Reported in scheduler
 * status because it is the only signal that survives the pipeline never running,
 * so an operator needs to see at a glance whether it is in place.
 */
export function isHeartbeatConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.PIPELINE_HEARTBEAT_URL?.trim());
}

export function lagInDays(latest: Date | null, now: Date): number | null {
  if (!latest) {
    return null;
  }
  const nowUtcDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const latestUtcDay = Date.UTC(latest.getUTCFullYear(), latest.getUTCMonth(), latest.getUTCDate());
  return Math.floor((nowUtcDay - latestUtcDay) / DAY_MS);
}

function describeLag(label: string, latest: Date | null, now: Date): string {
  if (!latest) {
    return `${label}: no data`;
  }
  return `${label}: ${latest.toISOString().slice(0, 10)} (${lagInDays(latest, now)}d behind)`;
}

/**
 * Decide which alerts are firing and which are confirmed clear for this run.
 * Pure: transport and dedup state live outside so the rules stay testable.
 */
export function evaluatePipelineAlerts(input: EvaluatePipelineAlertsInput): PipelineAlertEvaluation {
  const { now, config, freshness } = input;
  const firing: PipelineAlert[] = [];
  const resolved: PipelineAlertKey[] = [];

  if (input.runStatus === PipelineRunStatus.FAILED) {
    firing.push({
      key: "run-failed",
      severity: "critical",
      title: "Market-data pipeline run failed",
      detail: input.errorMessage ?? "The scheduled run failed without a message.",
      signature: input.errorMessage ?? "failed",
    });
  } else if (input.runStatus === PipelineRunStatus.SUCCEEDED || input.runStatus === PipelineRunStatus.NOOP) {
    resolved.push("run-failed");
  }

  const recoveredCount = input.recoveredAbandonedCount ?? 0;
  if (recoveredCount > 0) {
    firing.push({
      key: "run-abandoned",
      severity: "warning",
      title: "Market-data pipeline run was abandoned",
      detail: `${recoveredCount} run(s) ended without finalizing and were recovered after lease expiry.`,
      signature: `abandoned:${recoveredCount}`,
    });
  } else if (input.runStatus === PipelineRunStatus.SUCCEEDED) {
    resolved.push("run-abandoned");
  }

  const lockedCount = input.consecutiveLockedCount ?? 0;
  if (lockedCount >= config.lockContentionThreshold) {
    firing.push({
      key: "lock-contention",
      severity: "warning",
      title: "Market-data pipeline is repeatedly locked out",
      detail: `${lockedCount} consecutive attempts were skipped because another run held the lease.`,
      signature: `locked:${lockedCount}`,
    });
  } else if (input.runStatus === PipelineRunStatus.SUCCEEDED || input.runStatus === PipelineRunStatus.NOOP) {
    resolved.push("lock-contention");
  }

  const lags = [
    lagInDays(freshness.latestEquityMarkDate, now),
    lagInDays(freshness.latestOptionMarkDate, now),
    lagInDays(freshness.latestValueSnapshotDate, now),
  ];
  const worstLag = lags.reduce<number | null>((worst, lag) => {
    if (lag === null) {
      return worst;
    }
    return worst === null || lag > worst ? lag : worst;
  }, null);
  const hasMissingSource = lags.some((lag) => lag === null);

  if (hasMissingSource || (worstLag !== null && worstLag > config.freshnessLagDays)) {
    firing.push({
      key: "freshness-lag",
      severity: "critical",
      title: "Market-data freshness is beyond tolerance",
      detail: [
        describeLag("Equity marks", freshness.latestEquityMarkDate, now),
        describeLag("Option marks", freshness.latestOptionMarkDate, now),
        describeLag("Account values", freshness.latestValueSnapshotDate, now),
        `Tolerance: ${config.freshnessLagDays}d`,
      ].join(" | "),
      signature: `lag:${worstLag ?? "missing"}`,
    });
  } else {
    resolved.push("freshness-lag");
  }

  return { firing, resolved };
}

/**
 * Suppress a repeat of an alert that is already firing with the same signature
 * until the repeat window elapses, so a persistent failure pages once, not daily.
 */
export function shouldSendAlert(
  existing: PipelineAlertStateRecord | undefined,
  alert: PipelineAlert,
  now: Date,
  repeatMinutes: number,
): boolean {
  if (!existing || existing.state === PipelineAlertLifecycle.RESOLVED) {
    return true;
  }
  if (existing.signature !== alert.signature) {
    return true;
  }
  return now.getTime() - existing.lastSentAt.getTime() >= repeatMinutes * 60 * 1000;
}

export function shouldSendRecovery(existing: PipelineAlertStateRecord | undefined): boolean {
  return existing !== undefined && existing.state === PipelineAlertLifecycle.FIRING;
}

export class PrismaPipelineAlertStateStore implements PipelineAlertStateStore {
  constructor(private readonly prismaClient: Pick<PrismaClient, "pipelineAlertState"> = prisma) {}

  async load(jobName: string): Promise<PipelineAlertStateRecord[]> {
    const rows = await this.prismaClient.pipelineAlertState.findMany({ where: { jobName } });
    return rows.map((row) => ({
      alertKey: row.alertKey,
      state: row.state,
      signature: row.signature,
      lastSentAt: row.lastSentAt,
    }));
  }

  async markFiring(jobName: string, alert: PipelineAlert, now: Date): Promise<void> {
    await this.prismaClient.pipelineAlertState.upsert({
      where: { alertKey: alert.key },
      create: {
        alertKey: alert.key,
        jobName,
        state: PipelineAlertLifecycle.FIRING,
        signature: alert.signature,
        firstSeenAt: now,
        lastSentAt: now,
      },
      update: {
        state: PipelineAlertLifecycle.FIRING,
        signature: alert.signature,
        lastSentAt: now,
        resolvedAt: null,
      },
    });
  }

  async markResolved(jobName: string, key: PipelineAlertKey, now: Date): Promise<void> {
    await this.prismaClient.pipelineAlertState.updateMany({
      where: { alertKey: key, jobName, state: PipelineAlertLifecycle.FIRING },
      data: { state: PipelineAlertLifecycle.RESOLVED, resolvedAt: now },
    });
  }
}

export type AlertWebhookFormat = "generic" | "slack" | "discord";

const SEVERITY_PREFIX: Record<PipelineAlertSeverity, string> = {
  critical: "[CRITICAL]",
  warning: "[WARNING]",
  info: "[RESOLVED]",
};

/**
 * Chat webhooks reject the structured payload — Slack requires `text`, Discord
 * requires `content` — so the destination decides the body shape.
 */
export function resolveWebhookFormat(url: string, override?: string): AlertWebhookFormat {
  const normalizedOverride = override?.trim().toLowerCase();
  if (normalizedOverride === "slack" || normalizedOverride === "discord" || normalizedOverride === "generic") {
    return normalizedOverride;
  }

  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "generic";
  }

  if (host === "hooks.slack.com") {
    return "slack";
  }
  if (host === "discord.com" || host === "discordapp.com" || host.endsWith(".discord.com")) {
    return "discord";
  }
  return "generic";
}

export function formatAlertMessage(payload: PipelineAlertPayload): string {
  return `${SEVERITY_PREFIX[payload.severity]} ${payload.title}\n${payload.detail}\n(${payload.jobName} · ${payload.occurredAt})`;
}

export function buildWebhookBody(payload: PipelineAlertPayload, format: AlertWebhookFormat): Record<string, unknown> {
  if (format === "slack") {
    return { text: formatAlertMessage(payload) };
  }
  if (format === "discord") {
    return { content: formatAlertMessage(payload) };
  }
  return { ...payload };
}

export class WebhookPipelineAlertTransport implements PipelineAlertTransport {
  constructor(
    private readonly config: PipelineAlertConfig,
    private readonly format: AlertWebhookFormat = resolveWebhookFormat(config.webhookUrl, config.webhookFormat),
  ) {}

  async send(payload: PipelineAlertPayload): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await fetch(this.config.webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildWebhookBody(payload, this.format)),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Alert webhook responded ${response.status}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Dead-man's-switch. In-pipeline alerts cannot fire when the pipeline never
 * runs, which is the failure that left production stale for four weeks. Pinging
 * an external monitor on every healthy finish inverts that: the monitor alerts
 * when the ping stops arriving, so silence itself becomes the signal.
 *
 * Deliberately not pinged on failure — a failed run should let the switch trip.
 */
export async function pingHeartbeat(
  runStatus: PipelineRunStatus,
  env: Record<string, string | undefined> = process.env,
  logger: DispatchLogger = console,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const url = env.PIPELINE_HEARTBEAT_URL?.trim();
  if (!url) {
    return false;
  }
  if (runStatus !== PipelineRunStatus.SUCCEEDED && runStatus !== PipelineRunStatus.NOOP) {
    return false;
  }

  const timeoutMs = parsePositiveInteger(env.PIPELINE_HEARTBEAT_TIMEOUT_MS, 10_000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { method: "POST", signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Heartbeat responded ${response.status}`);
    }
    logger.log(JSON.stringify({ component: "scheduled-market-data", event: "heartbeat_sent" }));
    return true;
  } catch (error) {
    // Never fail a good run because the monitor is unreachable.
    logger.warn(JSON.stringify({
      component: "scheduled-market-data",
      event: "heartbeat_failed",
      error: error instanceof Error ? error.message : String(error),
    }));
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

interface DispatchLogger {
  log(message: string): void;
  warn(message: string): void;
}

export interface NotifyPipelineOutcomeInput {
  jobName: string;
  now: Date;
  runStatus: PipelineRunStatus;
  errorMessage?: string | null;
  recoveredAbandonedCount?: number;
  consecutiveLockedCount?: number;
  freshness: PipelineFreshness;
  logger?: DispatchLogger;
  env?: Record<string, string | undefined>;
  stateStore?: PipelineAlertStateStore;
  transport?: PipelineAlertTransport;
}

/**
 * Single entry point used by the pipeline. Returns immediately when alerting is
 * not configured, so the pipeline behaves identically without alert env vars.
 */
export async function notifyPipelineOutcome(input: NotifyPipelineOutcomeInput): Promise<void> {
  const logger = input.logger ?? console;

  // Independent of webhook alerting: the heartbeat is the only signal that
  // survives the pipeline not running at all.
  await pingHeartbeat(input.runStatus, input.env, logger);

  const config = resolveAlertConfig(input.env);
  if (!config) {
    return;
  }
  const evaluation = evaluatePipelineAlerts({
    now: input.now,
    runStatus: input.runStatus,
    errorMessage: input.errorMessage,
    recoveredAbandonedCount: input.recoveredAbandonedCount,
    consecutiveLockedCount: input.consecutiveLockedCount,
    freshness: input.freshness,
    config,
  });

  const result = await dispatchPipelineAlerts({
    jobName: input.jobName,
    now: input.now,
    evaluation,
    config,
    stateStore: input.stateStore ?? new PrismaPipelineAlertStateStore(),
    transport: input.transport ?? new WebhookPipelineAlertTransport(config),
    logger,
  });

  if (result.sent > 0 || result.recovered > 0) {
    logger.log(JSON.stringify({
      component: "scheduled-market-data",
      event: "alerts_dispatched",
      sent: result.sent,
      recovered: result.recovered,
    }));
  }
}

/**
 * Send firing and recovery notifications for one run. Alert delivery never
 * fails the pipeline: transport errors are logged and swallowed.
 */
export async function dispatchPipelineAlerts(input: {
  jobName: string;
  now: Date;
  evaluation: PipelineAlertEvaluation;
  config: PipelineAlertConfig;
  stateStore: PipelineAlertStateStore;
  transport: PipelineAlertTransport;
  logger?: DispatchLogger;
}): Promise<{ sent: number; recovered: number }> {
  const logger = input.logger ?? console;
  const states = await input.stateStore.load(input.jobName);
  const byKey = new Map(states.map((state) => [state.alertKey, state]));
  let sent = 0;
  let recovered = 0;

  for (const alert of input.evaluation.firing) {
    if (!shouldSendAlert(byKey.get(alert.key), alert, input.now, input.config.repeatMinutes)) {
      continue;
    }
    try {
      await input.transport.send({
        jobName: input.jobName,
        event: "firing",
        key: alert.key,
        severity: alert.severity,
        title: alert.title,
        detail: alert.detail,
        occurredAt: input.now.toISOString(),
      });
      await input.stateStore.markFiring(input.jobName, alert, input.now);
      sent += 1;
    } catch (error) {
      logger.warn(JSON.stringify({
        component: "scheduled-market-data",
        event: "alert_delivery_failed",
        key: alert.key,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  const firingKeys = new Set(input.evaluation.firing.map((alert) => alert.key));
  for (const key of input.evaluation.resolved) {
    if (firingKeys.has(key) || !shouldSendRecovery(byKey.get(key))) {
      continue;
    }
    try {
      await input.transport.send({
        jobName: input.jobName,
        event: "resolved",
        key,
        severity: "info",
        title: `Recovered: ${key}`,
        detail: "The condition that triggered this alert is clear.",
        occurredAt: input.now.toISOString(),
      });
      await input.stateStore.markResolved(input.jobName, key, input.now);
      recovered += 1;
    } catch (error) {
      logger.warn(JSON.stringify({
        component: "scheduled-market-data",
        event: "alert_recovery_failed",
        key,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  return { sent, recovered };
}
