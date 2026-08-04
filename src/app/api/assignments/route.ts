import { NextResponse } from "next/server";
import { getCurrentUser, requireAdmin } from "@/lib/auth";
import {
  autoDistribute,
  createAssignment,
  createAssignmentsBulk,
  deleteAssignment,
  updateAssignment,
} from "@/lib/db";
import type { ContactMethod } from "@/lib/types";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "שגיאה";
  const status = message.includes("נתן שמחה") ? 403 : 400;
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as {
      action?: string;
      assigneeId?: string;
      recipientId?: string;
      recipientIds?: string[];
    };

    if (body.action === "auto-distribute") {
      const assignments = await autoDistribute();
      return NextResponse.json({ assignments });
    }

    if (body.action === "bulk" && body.assigneeId && body.recipientIds) {
      const assignments = await createAssignmentsBulk({
        assigneeId: body.assigneeId,
        recipientIds: body.recipientIds,
      });
      return NextResponse.json({ assignments });
    }

    if (!body.assigneeId || !body.recipientId) {
      return NextResponse.json(
        { error: "נא לבחור מודה ומקבל תודה" },
        { status: 400 },
      );
    }

    const assignment = await createAssignment({
      assigneeId: body.assigneeId,
      recipientId: body.recipientId,
    });
    return NextResponse.json({ assignment });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      id?: string;
      status?: "pending" | "done";
      contactMethod?: ContactMethod | null;
      feedback?: string;
      needsAdditionalThanks?: boolean;
      additionalThankerIds?: string[];
      additionalThankerNote?: string;
      assigneeId?: string;
    };
    if (!body.id) {
      return NextResponse.json({ error: "חסר מזהה" }, { status: 400 });
    }

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "יש להתחבר קודם" }, { status: 401 });
    }

    const reassigning = body.assigneeId !== undefined;
    if (reassigning && !user.isAdmin) {
      await requireAdmin();
    }

    // Non-admins may only update their own assignments' thank-you details.
    if (!user.isAdmin) {
      const { getDatabase } = await import("@/lib/db");
      const db = await getDatabase();
      const existing = db.assignments.find((a) => a.id === body.id);
      if (!existing || existing.assigneeId !== user.id) {
        return NextResponse.json(
          { error: "ניתן לעדכן רק משימות ששויכו אליך" },
          { status: 403 },
        );
      }
    }

    const assignment = await updateAssignment(body.id, body);
    return NextResponse.json({ assignment });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "חסר מזהה" }, { status: 400 });
    }
    await deleteAssignment(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
