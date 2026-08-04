import { cookies } from "next/headers";
import { getDatabase } from "./db";
import { SESSION_COOKIE } from "./session";
import type { Person } from "./types";

export async function getCurrentUser(): Promise<Person | null> {
  const jar = await cookies();
  const userId = jar.get(SESSION_COOKIE)?.value;
  if (!userId) return null;
  const db = await getDatabase();
  return db.people.find((p) => p.id === userId && p.isSenior) ?? null;
}

export async function requireAdmin(): Promise<Person> {
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    throw new Error("רק נתן שמחה גרינברג יכול לבצע פעולת ניהול");
  }
  return user;
}
