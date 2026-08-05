import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getLiveSnapshot,
  heartbeatPresence,
  postChatMessage,
} from "@/lib/live-store";

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

    const body = (await request.json()) as {
      action?: string;
      text?: string;
    };

    if (body.action === "heartbeat") {
      await heartbeatPresence({
        userId: user.id,
        name: user.name,
      });
      const snapshot = await getLiveSnapshot();
      return NextResponse.json(snapshot);
    }

    if (body.action === "chat") {
      await postChatMessage({
        senderId: user.id,
        senderName: user.name,
        text: body.text ?? "",
      });
      const snapshot = await getLiveSnapshot();
      return NextResponse.json(snapshot);
    }

    return NextResponse.json({ error: "פעולה לא ידועה" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "שגיאה";
    const status = message.includes("הודעה") || message.includes("נא ") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
