-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "broker_name" TEXT,
ADD COLUMN     "display_label" TEXT,
ADD COLUMN     "starting_capital" DECIMAL(20,2);
