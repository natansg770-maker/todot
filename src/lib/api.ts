import type {
  ActivityEvent,
  Assignment,
  ClaimRequest,
  ContactMethod,
  Database,
  Person,
  Role,
  Stats,
} from "./types";

export type DbResponse = Database & { stats: Stats };

export type LiveSnapshot = {
  onlineCount: number;
  online: { id: string; name: string }[];
  activity: ActivityEvent[];
  serverTime: string;
};

async function parse<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || "בקשה נכשלה");
  }
  return data;
}

async function request(input: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(input, {
      ...init,
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("השרת לא מגיב. רעננו את הדף או נסו שוב בעוד רגע");
    }
    throw new Error("בעיית רשת. בדקו את החיבור ונסו שוב");
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchDb(): Promise<DbResponse> {
  return parse(await request("/api/db"));
}

export async function fetchSession(): Promise<Person | null> {
  const data = await parse<{ user: Person | null }>(await request("/api/session"));
  return data.user;
}

export async function fetchLive(): Promise<LiveSnapshot> {
  return parse(await request("/api/live"));
}

export async function postHeartbeat(): Promise<LiveSnapshot> {
  return parse(
    await request("/api/live", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "heartbeat" }),
    }),
  );
}

export async function setSession(
  userId: string | null,
  password?: string,
): Promise<Person | null> {
  const data = await parse<{ user: Person | null }>(
    await request("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, password }),
    }),
  );
  return data.user;
}

export type SeniorPasswordInfo = {
  id: string;
  name: string;
  roleId: string;
  usesDefaultPassword: boolean;
  defaultPassword: string | null;
};

export async function fetchSeniorPasswordsApi(): Promise<SeniorPasswordInfo[]> {
  const data = await parse<{ seniors: SeniorPasswordInfo[] }>(
    await request("/api/passwords"),
  );
  return data.seniors;
}

export async function changePasswordApi(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<Person> {
  const data = await parse<{ person: Person }>(
    await request("/api/passwords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "change", ...input }),
    }),
  );
  return data.person;
}

export async function resetPasswordApi(input: {
  personId: string;
  newPassword: string;
}): Promise<Person> {
  const data = await parse<{ person: Person }>(
    await request("/api/passwords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset", ...input }),
    }),
  );
  return data.person;
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

export async function claimAssignmentApi(recipientId: string): Promise<Assignment> {
  const data = await parse<{ assignment: Assignment }>(
    await request("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "claim", recipientId }),
    }),
  );
  return data.assignment;
}

export async function releaseAssignmentApi(assignmentId: string): Promise<void> {
  await parse(
    await request("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "release", assignmentId }),
    }),
  );
}

export async function reorderAssignmentsApi(
  assignmentIds: string[],
): Promise<Assignment[]> {
  const data = await parse<{ assignments: Assignment[] }>(
    await request("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reorder", assignmentIds }),
    }),
  );
  return data.assignments;
}

export async function createClaimRequestApi(input: {
  recipientId: string;
  targetAssigneeId: string;
  note?: string;
}): Promise<ClaimRequest> {
  const data = await parse<{ request: ClaimRequest }>(
    await request("/api/claims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", ...input }),
    }),
  );
  return data.request;
}

export async function respondClaimRequestApi(input: {
  requestId: string;
  approve: boolean;
}): Promise<{ request: ClaimRequest; assignment?: Assignment }> {
  return parse(
    await request("/api/claims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "respond", ...input }),
    }),
  );
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
    await request("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", assignmentId: id }),
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
