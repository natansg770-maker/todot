import { NextResponse } from "next/server";
import { recordActivity } from "@/lib/activity";
import { getCurrentUser, requireAdmin } from "@/lib/auth";
import {
  autoDistribute,
  claimForSelf,
  createAssignment,
  createAssignmentsBulk,
  deleteAssignment,
  getDatabase,
  releaseOwnAssignment,
  reorderOwnPriorities,
  updateAssignment,
} from "@/lib/db";
import type { ContactMethod } from "@/lib/types";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "שגיאה";
  const status = message.includes("נתן שמחה")
    ? 403
    : message.includes("הרשאה") || message.includes("רק")
      ? 403
      : 400;
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
    const body = (await request.json()) as {
      action?: string;
      assigneeId?: string;
      recipientId?: string;
      recipientIds?: string[];
      assignmentId?: string;
      assignmentIds?: string[];
    };

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "יש להתחבר קודם" }, { status: 401 });
    }

    if (body.action === "claim") {
      if (!body.recipientId) {
        return NextResponse.json({ error: "חסר מקבל תודה" }, { status: 400 });
      }
      const assignment = await claimForSelf({
        userId: user.id,
        recipientId: body.recipientId,
      });
      const db = await getDatabase();
      const recipient = personName(db.people, body.recipientId);
      await recordActivity({
        type: "claim",
        actorId: user.id,
        actorName: user.name,
        message: `${user.name} לקח תודה ל${recipient}`,
      });
      return NextResponse.json({ assignment });
    }

    if (body.action === "release") {
      if (!body.assignmentId) {
        return NextResponse.json({ error: "חסר מזהה שיוך" }, { status: 400 });
      }
      const dbBefore = await getDatabase();
      const existing = dbBefore.assignments.find(
        (a) => a.id === body.assignmentId,
      );
      const recipient = personName(dbBefore.people, existing?.recipientId);
      await releaseOwnAssignment({
        userId: user.id,
        assignmentId: body.assignmentId,
        isAdmin: Boolean(user.isAdmin),
      });
      await recordActivity({
        type: "release",
        actorId: user.id,
        actorName: user.name,
        message: `${user.name} שחרר את התודה ל${recipient}`,
      });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "delete") {
      if (!body.assignmentId) {
        return NextResponse.json({ error: "חסר מזהה שיוך" }, { status: 400 });
      }
      const dbBefore = await getDatabase();
      const existing = dbBefore.assignments.find(
        (a) => a.id === body.assignmentId,
      );
      const recipient = personName(dbBefore.people, existing?.recipientId);
      const assignee = personName(dbBefore.people, existing?.assigneeId);
      if (user.isAdmin) {
        await deleteAssignment(body.assignmentId);
      } else {
        await releaseOwnAssignment({
          userId: user.id,
          assignmentId: body.assignmentId,
          isAdmin: false,
        });
      }
      await recordActivity({
        type: "delete",
        actorId: user.id,
        actorName: user.name,
        message: `${user.name} מחק שיוך: ${assignee} → ${recipient}`,
      });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "reorder") {
      if (!body.assignmentIds?.length) {
        return NextResponse.json(
          { error: "חסרה רשימת עדיפויות" },
          { status: 400 },
        );
      }
      const assignments = await reorderOwnPriorities({
        userId: user.id,
        assignmentIds: body.assignmentIds,
      });
      return NextResponse.json({ assignments });
    }

    // Admin-only bulk / distribute / manual assign
    await requireAdmin();

    if (body.action === "auto-distribute") {
      const assignments = await autoDistribute();
      await recordActivity({
        type: "claim",
        actorId: user.id,
        actorName: user.name,
        message: `${user.name} פיזר אוטומטית ${assignments.length} תודות`,
      });
      return NextResponse.json({ assignments });
    }

    if (body.action === "bulk" && body.assigneeId && body.recipientIds) {
      const assignments = await createAssignmentsBulk({
        assigneeId: body.assigneeId,
        recipientIds: body.recipientIds,
      });
      const db = await getDatabase();
      await recordActivity({
        type: "claim",
        actorId: user.id,
        actorName: user.name,
        message: `${user.name} שייך ${assignments.length} תודות ל${personName(db.people, body.assigneeId)}`,
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
    const db = await getDatabase();
    await recordActivity({
      type: "claim",
      actorId: user.id,
      actorName: user.name,
      message: `${user.name} שייך ל${personName(db.people, body.assigneeId)} את ${personName(db.people, body.recipientId)}`,
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

    const db = await getDatabase();
    const existing = db.assignments.find((a) => a.id === body.id);

    if (!user.isAdmin) {
      if (!existing || existing.assigneeId !== user.id) {
        return NextResponse.json(
          { error: "ניתן לעדכן רק משימות ששויכו אליך" },
          { status: 403 },
        );
      }
    }

    const assignment = await updateAssignment(body.id, body);
    if (body.status === "done") {
      const recipient = personName(db.people, assignment.recipientId);
      const method =
        body.contactMethod === "sms"
          ? "בסמס"
          : body.contactMethod === "phone"
            ? "בשיחה"
            : "";
      await recordActivity({
        type: "done",
        actorId: user.id,
        actorName: user.name,
        message: `${user.name} סיים תודה ל${recipient}${method ? ` ${method}` : ""}`,
      });
    }
    return NextResponse.json({ assignment });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "יש להתחבר קודם" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "חסר מזהה" }, { status: 400 });
    }

    const dbBefore = await getDatabase();
    const existing = dbBefore.assignments.find((a) => a.id === id);
    const recipient = personName(dbBefore.people, existing?.recipientId);

    if (user.isAdmin) {
      await deleteAssignment(id);
    } else {
      await releaseOwnAssignment({
        userId: user.id,
        assignmentId: id,
        isAdmin: false,
      });
    }
    await recordActivity({
      type: "delete",
      actorId: user.id,
      actorName: user.name,
      message: `${user.name} מחק שיוך ל${recipient}`,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
