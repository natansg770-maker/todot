import { cookies } from "next/headers";

export const SESSION_COOKIE = "todot_user";

export async function getSessionUserId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}
