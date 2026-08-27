-- Entity segregation phase 1a (issue #333): legal ownership of accounts.
-- Legal entity names are data with stable ids/slugs, never enum values.

-- CreateEnum
CREATE TYPE "EntityKind" AS ENUM ('CORPORATION', 'INDIVIDUAL');

-- CreateTable
CREATE TABLE "legal_entities" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "kind" "EntityKind" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legal_entities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "legal_entities_slug_key" ON "legal_entities"("slug");

-- AlterTable: null = unclassified (quarantined from entity-scoped surfaces)
ALTER TABLE "accounts" ADD COLUMN "legal_entity_id" TEXT;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the two entities (operator decision 2026-08-26).
INSERT INTO "legal_entities" ("id", "slug", "legal_name", "kind", "created_at", "updated_at") VALUES
    ('le_kapman_capital', 'kapman-capital', 'Kapman Capital Inc.', 'CORPORATION', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('le_personal_vkapella', 'personal-vkapella', 'Victor Kapella', 'INDIVIDUAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Backfill: accounts predating the 2026-08-26 clean break are personal-era
-- (operator decision). Accounts created on/after the clean-break date stay
-- unclassified so a corporate import is never silently mislabeled.
UPDATE "accounts"
SET "legal_entity_id" = 'le_personal_vkapella'
WHERE "legal_entity_id" IS NULL
  AND "created_at" < TIMESTAMP '2026-08-26 00:00:00';
