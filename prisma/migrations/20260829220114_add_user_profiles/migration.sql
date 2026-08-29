-- CreateTable
CREATE TABLE "user_profiles" (
    "email" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "revision" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("email")
);

