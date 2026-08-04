import { NextResponse } from "next/server";
import {
  autoDistribute,
  createAssignment,
  createAssignmentsBulk,
  deleteAssignment,
  updateAssignment,
} from "@/lib/db";
import type { ContactMethod } from "@/lib/types";

export async function POST(request: Request) {
  try {
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "שגיאה" },
      { status: 400 },
    );
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
    const assignment = await updateAssignment(body.id, body);
    return NextResponse.json({ assignment });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "שגיאה" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "חסר מזהה" }, { status: 400 });
    }
    await deleteAssignment(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "שגיאה" },
      { status: 400 },
    );
  }
}
