import type { Database } from "./types";

/**
 * Prevents accidental wipes of live claims.
 *
 * Normal ops (one release / one delete) may reduce count by a few.
 * Falling back to an empty seed and then saving must never overwrite
 * a fuller remote database.
 */
export function assertSafeAssignmentWrite(
  next: Database,
  current: Database | null,
  options?: { allowDestructive?: boolean },
): void {
  if (options?.allowDestructive) return;
  if (!current) return;

  const currentCount = Array.isArray(current.assignments)
    ? current.assignments.length
    : 0;
  const nextCount = Array.isArray(next.assignments) ? next.assignments.length : 0;
  const drop = currentCount - nextCount;

  if (drop <= 0) return;

  // Hard stop: collapsing many claims to zero (classic seed wipe).
  if (nextCount === 0 && currentCount > 3) {
    throw new Error(
      `נחסמה שמירה מסוכנת: ניסיון למחוק את כל ${currentCount} הלקיחות. לא נמחק כלום.`,
    );
  }

  // Hard stop: large sudden drop in one write (seed+1-claim overwriting dozens).
  if (drop > 3) {
    throw new Error(
      `נחסמה שמירה מסוכנת: בניסיון לשמור ${nextCount} לקיחות, אבל במערכת יש כרגע ${currentCount}. לא נמחק כלום.`,
    );
  }
}

/** True when running on Vercel / production — never invent an empty seed DB. */
export function isLiveRuntime(): boolean {
  return (
    process.env.VERCEL === "1" ||
    process.env.NODE_ENV === "production" ||
    process.env.FORCE_LIVE_DB === "1"
  );
}
