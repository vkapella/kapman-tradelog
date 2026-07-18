CREATE TABLE "scheduled_job_leases" (
    "job_name" TEXT NOT NULL,
    "lease_owner" TEXT NOT NULL,
    "lease_expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_job_leases_pkey" PRIMARY KEY ("job_name")
);

CREATE INDEX "scheduled_job_leases_lease_expires_at_idx" ON "scheduled_job_leases"("lease_expires_at");
