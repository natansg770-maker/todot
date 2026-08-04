import type {
  Assignment,
  ContactMethod,
  Database,
  Person,
  Role,
  Stats,
} from "./types";

export type DbResponse = Database & { stats: Stats };

async function parse<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || "בקשה נכשלה");
  }
  return data;
}

export async function fetchDb(): Promise<DbResponse> {
  return parse(await fetch("/api/db", { cache: "no-store" }));
}

export async function fetchSession(): Promise<Person | null> {
  const data = await parse<{ user: Person | null }>(
    await fetch("/api/session", { cache: "no-store" }),
  );
  return data.user;
}

export async function setSession(userId: string | null): Promise<Person | null> {
  const data = await parse<{ user: Person | null }>(
    await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    }),
  );
  return data.user;
}

export async function createRole(name: string): Promise<Role> {
  const data = await parse<{ role: Role }>(
    await fetch("/api/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  );
  return data.role;
}

export async function updateRoleApi(
  id: string,
  patch: Partial<Pick<Role, "name" | "sortOrder">>,
): Promise<Role> {
  const data = await parse<{ role: Role }>(
    await fetch("/api/roles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    }),
  );
  return data.role;
}

export async function deleteRoleApi(id: string): Promise<void> {
  await parse(await fetch(`/api/roles?id=${encodeURIComponent(id)}`, { method: "DELETE" }));
}

export async function createPerson(input: {
  name: string;
  roleId: string;
  isSenior?: boolean;
  phone?: string;
  notes?: string;
}): Promise<Person> {
  const data = await parse<{ person: Person }>(
    await fetch("/api/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
  return data.person;
}

export async function updatePersonApi(
  id: string,
  patch: Partial<Pick<Person, "name" | "roleId" | "isSenior" | "phone" | "notes">>,
): Promise<Person> {
  const data = await parse<{ person: Person }>(
    await fetch("/api/people", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    }),
  );
  return data.person;
}

export async function deletePersonApi(id: string): Promise<void> {
  await parse(
    await fetch(`/api/people?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
  );
}

export async function createAssignmentApi(input: {
  assigneeId: string;
  recipientId: string;
}): Promise<Assignment> {
  const data = await parse<{ assignment: Assignment }>(
    await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
  return data.assignment;
}

export async function createAssignmentsBulkApi(input: {
  assigneeId: string;
  recipientIds: string[];
}): Promise<Assignment[]> {
  const data = await parse<{ assignments: Assignment[] }>(
    await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bulk", ...input }),
    }),
  );
  return data.assignments;
}

export async function autoDistributeApi(): Promise<Assignment[]> {
  const data = await parse<{ assignments: Assignment[] }>(
    await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "auto-distribute" }),
    }),
  );
  return data.assignments;
}

export async function updateAssignmentApi(
  id: string,
  patch: {
    status?: "pending" | "done";
    contactMethod?: ContactMethod | null;
    feedback?: string;
    needsAdditionalThanks?: boolean;
    additionalThankerIds?: string[];
    additionalThankerNote?: string;
    assigneeId?: string;
  },
): Promise<Assignment> {
  const data = await parse<{ assignment: Assignment }>(
    await fetch("/api/assignments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    }),
  );
  return data.assignment;
}

export async function deleteAssignmentApi(id: string): Promise<void> {
  await parse(
    await fetch(`/api/assignments?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  );
}

export async function resetDbApi(): Promise<DbResponse> {
  return parse(
    await fetch("/api/db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset" }),
    }),
  );
}

export async function uploadLogoApi(file: File): Promise<{
  src: string;
  version: number;
}> {
  const form = new FormData();
  form.append("logo", file);
  return parse(
    await fetch("/api/logo", {
      method: "POST",
      body: form,
    }),
  );
}
