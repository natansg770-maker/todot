import { logActivity } from "./live-store";
import type { ActivityType } from "./types";

/** Fire-and-forget activity logging — never fails the main request. */
export function recordActivity(input: {
  type: ActivityType;
  actorId: string;
  actorName: string;
  message: string;
}): void {
  void logActivity(input).catch(() => {
    // ignore live-store write failures
  });
}
