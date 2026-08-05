import { logActivity } from "./live-store";
import type { ActivityType } from "./types";

/** Persist an activity event; swallows live-store failures. */
export async function recordActivity(input: {
  type: ActivityType;
  actorId: string;
  actorName: string;
  message: string;
}): Promise<void> {
  try {
    await logActivity(input);
  } catch {
    // ignore live-store write failures
  }
}
