import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const [accountTotal, importTotal, snapshotTotal] = await Promise.all([
    prisma.account.count(),
    prisma.import.count(),
    prisma.dailyAccountSnapshot.count(),
  ]);

  return NextResponse.json({
    data: {
      accountTotal,
      importTotal,
      snapshotTotal,
    },
  });
}
