import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { addPerson, deletePerson, updatePerson } from "@/lib/db";

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as {
      name?: string;
      roleId?: string;
      isSenior?: boolean;
      phone?: string;
      notes?: string;
    };
    if (!body.name?.trim() || !body.roleId) {
      return NextResponse.json(
        { error: "נא למלא שם ותפקיד" },
        { status: 400 },
      );
    }
    const person = await addPerson({
      name: body.name,
      roleId: body.roleId,
      isSenior: body.isSenior,
      phone: body.phone,
      notes: body.notes,
    });
    return NextResponse.json({ person });
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
      roleId?: string;
      isSenior?: boolean;
      phone?: string;
      notes?: string;
    };
    if (!body.id) {
      return NextResponse.json({ error: "חסר מזהה" }, { status: 400 });
    }
    const person = await updatePerson(body.id, {
      name: body.name,
      roleId: body.roleId,
      isSenior: body.isSenior,
      phone: body.phone,
      notes: body.notes,
    });
    return NextResponse.json({ person });
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
    await deletePerson(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "שגיאה";
    const status = message.includes("נתן שמחה") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
