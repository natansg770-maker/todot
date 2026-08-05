import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClaimRequest, respondClaimRequest } from "@/lib/db";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "שגיאה";
  const status =
    message.includes("הרשאה") || message.includes("רק") ? 403 : 400;
  return NextResponse.json({ error: message }, { status });
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
      const result = await respondClaimRequest({
        requestId: body.requestId,
        actorId: user.id,
        approve: body.approve,
        isAdmin: Boolean(user.isAdmin),
      });
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
    return NextResponse.json({ request: claimRequest });
  } catch (error) {
    return errorResponse(error);
  }
}
