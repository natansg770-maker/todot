import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getLiveSnapshot, heartbeatPresence } from "@/lib/live-store";

export async function GET() {
  try {
    const snapshot = await getLiveSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "שגיאה";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "יש להתחבר קודם" }, { status: 401 });
    }

    const body = (await request.json()) as { action?: string };
    if (body.action !== "heartbeat") {
      return NextResponse.json({ error: "פעולה לא ידועה" }, { status: 400 });
    }

    const { onlineCount } = await heartbeatPresence({
      userId: user.id,
      name: user.name,
    });
    const snapshot = await getLiveSnapshot();
    return NextResponse.json({ ...snapshot, onlineCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "שגיאה";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
