import type { Assignment, Database, Person, Role } from "./types";

export function roleName(db: Database, roleId: string): string {
  return db.roles.find((r) => r.id === roleId)?.name ?? "ללא תפקיד";
}

export function personById(db: Database, id: string): Person | undefined {
  return db.people.find((p) => p.id === id);
}

export function sortedRoles(db: Database): Role[] {
  return [...db.roles].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function seniors(db: Database): Person[] {
  return db.people
    .filter((p) => p.isSenior)
    .sort((a, b) => a.name.localeCompare(b.name, "he"));
}

export function thankablePeople(db: Database): Person[] {
  return db.people
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "he"));
}

export function peopleByRole(db: Database, roleId: string): Person[] {
  return db.people
    .filter((p) => p.roleId === roleId)
    .sort((a, b) => a.name.localeCompare(b.name, "he"));
}

export function assignmentsForAssignee(
  db: Database,
  assigneeId: string,
): Assignment[] {
  return db.assignments
    .filter((a) => a.assigneeId === assigneeId)
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
      const pa = a.priority ?? Number.MAX_SAFE_INTEGER;
      const pb = b.priority ?? Number.MAX_SAFE_INTEGER;
      if (pa !== pb) return pa - pb;
      return a.createdAt.localeCompare(b.createdAt);
    });
}

export function recipientCoverage(db: Database, recipientId: string) {
  const items = db.assignments.filter((a) => a.recipientId === recipientId);
  return {
    assignments: items,
    hasAny: items.length > 0,
    hasDone: items.some((a) => a.status === "done"),
    pending: items.filter((a) => a.status === "pending"),
  };
}

export function contactLabel(method?: "phone" | "sms" | null): string {
  if (method === "phone") return "שיחת טלפון";
  if (method === "sms") return "סמס";
  return "לא צוין";
}

export function percent(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((done / total) * 100);
}
