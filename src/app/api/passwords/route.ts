import { NextResponse } from "next/server";
import { getCurrentUser, requireAdmin } from "@/lib/auth";
import { getDatabase, setPersonPassword } from "@/lib/db";
import { DEFAULT_SENIOR_PASSWORDS } from "@/lib/passwords";

export async function GET() {
  try {
    await requireAdmin();
    const db = await getDatabase();
    const seniors = db.people
      .filter((p) => p.isSenior)
      .map((p) => ({
        id: p.id,
        name: p.name,
        roleId: p.roleId,
        usesDefaultPassword: Boolean(p.usesDefaultPassword),
        defaultPassword: p.usesDefaultPassword
          ? DEFAULT_SENIOR_PASSWORDS[p.name] ?? null
          : null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "he"));

    return NextResponse.json({ seniors });
  } catch (error) {
    const message = error instanceof Error ? error.message : "שגיאה";
    const status = message.includes("נתן שמחה") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: "change" | "reset";
      personId?: string;
      currentPassword?: string;
      newPassword?: string;
    };

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "יש להתחבר קודם" }, { status: 401 });
    }

    if (!body.newPassword?.trim()) {
      return NextResponse.json({ error: "נא להזין סיסמה חדשה" }, { status: 400 });
    }

    if (body.action === "reset") {
      await requireAdmin();
      if (!body.personId) {
        return NextResponse.json({ error: "חסר משתמש" }, { status: 400 });
      }
      const person = await setPersonPassword({
        personId: body.personId,
        password: body.newPassword,
        asDefault: false,
      });
      return NextResponse.json({ person });
    }

    // Self password change
    const { authenticateSenior } = await import("@/lib/db");
    await authenticateSenior(user.id, body.currentPassword ?? "");
    const person = await setPersonPassword({
      personId: user.id,
      password: body.newPassword,
      asDefault: false,
    });
    return NextResponse.json({ person });
  } catch (error) {
    const message = error instanceof Error ? error.message : "שגיאה";
    const status =
      message.includes("סיסמה שגויה") || message.includes("נתן שמחה")
        ? 403
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
