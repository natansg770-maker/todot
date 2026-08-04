import { NextResponse } from "next/server";
import { computeStats, getDatabase, resetDatabase } from "@/lib/db";

export async function GET() {
  const db = await getDatabase();
  return NextResponse.json({ ...db, stats: computeStats(db) });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { action?: string };
  if (body.action === "reset") {
    const db = await resetDatabase();
    return NextResponse.json({ ...db, stats: computeStats(db) });
  }
  return NextResponse.json({ error: "פעולה לא ידועה" }, { status: 400 });
}
