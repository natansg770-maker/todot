import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { addRole, deleteRole, updateRole } from "@/lib/db";

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as { name?: string };
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "נא להזין שם תפקיד" }, { status: 400 });
    }
    const role = await addRole(body.name);
    return NextResponse.json({ role });
  } catch (error) {
    const message = error instanceof Error ? error.message : "שגיאה";
    const status = message.includes("נתן שמחה") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as {
      id?: string;
      name?: string;
      sortOrder?: number;
    };
    if (!body.id) {
      return NextResponse.json({ error: "חסר מזהה" }, { status: 400 });
    }
    const role = await updateRole(body.id, {
      name: body.name,
      sortOrder: body.sortOrder,
    });
    return NextResponse.json({ role });
  } catch (error) {
    const message = error instanceof Error ? error.message : "שגיאה";
    const status = message.includes("נתן שמחה") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
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
    await deleteRole(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "שגיאה";
    const status = message.includes("נתן שמחה") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
