import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDatabase } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/session";

export async function GET() {
  const jar = await cookies();
  const userId = jar.get(SESSION_COOKIE)?.value ?? null;
  if (!userId) return NextResponse.json({ user: null });

  const db = await getDatabase();
  const user = db.people.find((p) => p.id === userId && p.isSenior) ?? null;
  return NextResponse.json({ user });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { userId?: string | null };
  const jar = await cookies();

  if (!body.userId) {
    jar.delete(SESSION_COOKIE);
    return NextResponse.json({ user: null });
  }

  const db = await getDatabase();
  const user = db.people.find((p) => p.id === body.userId && p.isSenior);
  if (!user) {
    return NextResponse.json({ error: "משתמש לא נמצא בצוות הבכיר" }, { status: 400 });
  }

  jar.set(SESSION_COOKIE, user.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 60,
  });

  return NextResponse.json({ user });
}
