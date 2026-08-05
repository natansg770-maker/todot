import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authenticateSenior, getDatabase, publicPerson } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/session";

export async function GET() {
  const jar = await cookies();
  const userId = jar.get(SESSION_COOKIE)?.value ?? null;
  if (!userId) return NextResponse.json({ user: null });

  const db = await getDatabase();
  const user = db.people.find((p) => p.id === userId && p.isSenior) ?? null;
  return NextResponse.json({ user: user ? publicPerson(user) : null });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      userId?: string | null;
      password?: string;
    };
    const jar = await cookies();

    if (!body.userId) {
      jar.delete(SESSION_COOKIE);
      return NextResponse.json({ user: null });
    }

    if (!body.password?.trim()) {
      return NextResponse.json({ error: "נא להזין סיסמה" }, { status: 400 });
    }

    const user = await authenticateSenior(body.userId, body.password.trim());

    jar.set(SESSION_COOKIE, user.id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 60,
      secure: process.env.NODE_ENV === "production",
    });

    return NextResponse.json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "שגיאה";
    const status = message.includes("סיסמה שגויה") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
