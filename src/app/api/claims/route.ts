import { NextResponse } from "next/server";
import { recordActivity } from "@/lib/activity";
import { getCurrentUser } from "@/lib/auth";
import {
  createClaimRequest,
  getDatabase,
  respondClaimRequest,
} from "@/lib/db";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "שגיאה";
  const status =
    message.includes("הרשאה") || message.includes("רק") ? 403 : 400;
  return NextResponse.json({ error: message }, { status });
}

function personName(
  people: { id: string; name: string }[],
  id: string | undefined,
) {
  if (!id) return "מישהו";
  return people.find((p) => p.id === id)?.name ?? "מישהו";
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "יש להתחבר קודם" }, { status: 401 });
    }

    const body = (await request.json()) as {
      action?: "create" | "respond";
      recipientId?: string;
      targetAssigneeId?: string;
      note?: string;
      requestId?: string;
      approve?: boolean;
    };

    if (body.action === "respond") {
      if (!body.requestId || body.approve === undefined) {
        return NextResponse.json(
          { error: "חסרים פרטי תשובה לבקשה" },
          { status: 400 },
        );
      }
      const db = await getDatabase();
      const pending = (db.claimRequests ?? []).find(
        (r) => r.id === body.requestId,
      );
      const result = await respondClaimRequest({
        requestId: body.requestId,
        actorId: user.id,
        approve: body.approve,
        isAdmin: Boolean(user.isAdmin),
      });
      const recipient = personName(db.people, pending?.recipientId);
      const requester = personName(db.people, pending?.requesterId);
      if (body.approve) {
        await recordActivity({
          type: "join_approved",
          actorId: user.id,
          actorName: user.name,
          message: `${user.name} אישר ל${requester} להצטרף לתודה ל${recipient}`,
        });
      } else {
        const selfCancel = pending?.requesterId === user.id;
        await recordActivity({
          type: "join_rejected",
          actorId: user.id,
          actorName: user.name,
          message: selfCancel
            ? `${user.name} ביטל בקשה להצטרף לתודה ל${recipient}`
            : `${user.name} דחה בקשה של ${requester} לתודה ל${recipient}`,
        });
      }
      return NextResponse.json(result);
    }

    if (!body.recipientId || !body.targetAssigneeId) {
      return NextResponse.json(
        { error: "נא לבחור למי להגיש בקשה" },
        { status: 400 },
      );
    }

    const claimRequest = await createClaimRequest({
      requesterId: user.id,
      recipientId: body.recipientId,
      targetAssigneeId: body.targetAssigneeId,
      note: body.note,
    });
    const db = await getDatabase();
    await recordActivity({
      type: "join_request",
      actorId: user.id,
      actorName: user.name,
      message: `${user.name} ביקש להצטרף לתודה ל${personName(db.people, body.recipientId)} (אצל ${personName(db.people, body.targetAssigneeId)})`,
    });
    return NextResponse.json({ request: claimRequest });
  } catch (error) {
    return errorResponse(error);
  }
}
