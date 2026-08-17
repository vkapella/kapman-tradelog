-- CreateEnum
CREATE TYPE "PipelineRunTrigger" AS ENUM ('SCHEDULED', 'MANUAL');

-- CreateEnum
CREATE TYPE "PipelineRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'NOOP', 'FAILED', 'SKIPPED_LOCKED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "PipelineStageStatus" AS ENUM ('PENDING', 'SKIPPED', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "PipelineAlertLifecycle" AS ENUM ('FIRING', 'RESOLVED');

-- CreateTable
CREATE TABLE "scheduled_pipeline_runs" (
    "id" TEXT NOT NULL,
    "job_name" TEXT NOT NULL,
    "trigger" "PipelineRunTrigger" NOT NULL DEFAULT 'SCHEDULED',
    "status" "PipelineRunStatus" NOT NULL DEFAULT 'RUNNING',
    "lease_owner" TEXT NOT NULL,
    "lease_expires_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "requested_start_date" DATE,
    "requested_end_date" DATE,
    "effective_start_date" DATE,
    "effective_end_date" DATE,
    "eligible_end_date" DATE,
    "common_mark_date" DATE,
    "equity_status" "PipelineStageStatus" NOT NULL DEFAULT 'PENDING',
    "equity_row_count" INTEGER,
    "option_status" "PipelineStageStatus" NOT NULL DEFAULT 'PENDING',
    "option_row_count" INTEGER,
    "values_status" "PipelineStageStatus" NOT NULL DEFAULT 'PENDING',
    "values_row_count" INTEGER,
    "excursion_status" "PipelineStageStatus" NOT NULL DEFAULT 'PENDING',
    "excursion_row_count" INTEGER,
    "latest_equity_mark_date" DATE,
    "latest_option_mark_date" DATE,
    "latest_value_snapshot_date" DATE,
    "unpriced_position_count" INTEGER,
    "unpriced_excursion_days" INTEGER,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_pipeline_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scheduled_pipeline_runs_job_name_started_at_idx" ON "scheduled_pipeline_runs"("job_name", "started_at");

-- CreateIndex
CREATE INDEX "scheduled_pipeline_runs_status_idx" ON "scheduled_pipeline_runs"("status");

-- CreateIndex
CREATE INDEX "scheduled_pipeline_runs_started_at_idx" ON "scheduled_pipeline_runs"("started_at");

-- CreateTable
CREATE TABLE "pipeline_alert_states" (
    "alert_key" TEXT NOT NULL,
    "job_name" TEXT NOT NULL,
    "state" "PipelineAlertLifecycle" NOT NULL DEFAULT 'FIRING',
    "signature" TEXT,
    "first_seen_at" TIMESTAMP(3) NOT NULL,
    "last_sent_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_alert_states_pkey" PRIMARY KEY ("alert_key")
);

-- CreateIndex
CREATE INDEX "pipeline_alert_states_job_name_idx" ON "pipeline_alert_states"("job_name");
