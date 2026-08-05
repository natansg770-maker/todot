import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  computeStats,
  getDatabase,
  publicDatabase,
  resetDatabase,
  saveCurrentAsDefault,
} from "@/lib/db";

export async function GET() {
  try {
    const db = await getDatabase();
    return NextResponse.json({
      ...publicDatabase(db),
      stats: computeStats(db),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "שגיאה";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { action?: string };
    if (body.action === "save_default") {
      await requireAdmin();
      const result = await saveCurrentAsDefault();
      return NextResponse.json({ ok: true, ...result });
    }
    if (body.action === "reset") {
      await requireAdmin();
      const db = await resetDatabase();
      return NextResponse.json({
        ...publicDatabase(db),
        stats: computeStats(db),
      });
    }
    return NextResponse.json({ error: "פעולה לא ידועה" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "שגיאה";
    const status = message.includes("נתן שמחה") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
