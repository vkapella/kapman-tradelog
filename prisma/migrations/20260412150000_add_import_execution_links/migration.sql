-- CreateTable
CREATE TABLE "import_executions" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "import_id" TEXT NOT NULL,
    "execution_id" TEXT NOT NULL,

    CONSTRAINT "import_executions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_executions_execution_id_idx" ON "import_executions"("execution_id");

-- CreateIndex
CREATE UNIQUE INDEX "import_executions_import_id_execution_id_key" ON "import_executions"("import_id", "execution_id");

-- AddForeignKey
ALTER TABLE "import_executions" ADD CONSTRAINT "import_executions_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_executions" ADD CONSTRAINT "import_executions_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill existing execution ownership as link rows
INSERT INTO "import_executions" ("id", "created_at", "import_id", "execution_id")
SELECT ('legacy-' || e."id"), e."created_at", e."import_id", e."id"
FROM "executions" e
ON CONFLICT ("import_id", "execution_id") DO NOTHING;
