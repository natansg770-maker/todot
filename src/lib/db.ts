import { promises as fs } from "fs";
import path from "path";
import { canUseBlobDb, readBlobDb, writeBlobDb } from "./blob-db";
import { canUseGithubDb, readGithubDb, writeGithubDb } from "./github-db";
import { createSeedDatabase } from "./seed";
import {
  ADMIN_NAME,
  type Assignment,
  type ContactMethod,
  type Database,
  type Person,
  type Role,
  type Stats,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "db.json");

const SENIOR_ROLE_NAMES = new Set([
  "גנרל",
  "מנהל מטבח",
  "מנהל משבקי״ם",
  'מנהל משבקי"ם',
  "מנהל צוות טכני",
  "מנהל שלאפט א חסיד",
  "קצין",
  "הנהלה בכירה",
]);

let githubSha: string | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function normalizePeople(db: Database): boolean {
  let changed = false;
  const roleNameById = new Map(db.roles.map((r) => [r.id, r.name]));
  for (const person of db.people) {
    const shouldAdmin = person.name === ADMIN_NAME;
    if (Boolean(person.isAdmin) !== shouldAdmin) {
      person.isAdmin = shouldAdmin;
      changed = true;
    }
    const roleName = roleNameById.get(person.roleId) ?? "";
    const shouldSenior = SENIOR_ROLE_NAMES.has(roleName) || shouldAdmin;
    if (Boolean(person.isSenior) !== shouldSenior) {
      person.isSenior = shouldSenior;
      changed = true;
    }
  }
  return changed;
}

async function ensureDb(): Promise<Database> {
  if (canUseBlobDb()) {
    const db = await readBlobDb();
    if (normalizePeople(db)) {
      return saveDb(db);
    }
    return db;
  }

  if (canUseGithubDb()) {
    const { db, sha } = await readGithubDb();
    githubSha = sha;
    if (normalizePeople(db)) {
      return saveDb(db);
    }
    return db;
  }

  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    const db = JSON.parse(raw) as Database;
    if (normalizePeople(db)) {
      return saveDb(db);
    }
    return db;
  } catch {
    const seed = createSeedDatabase();
    return saveDb(seed);
  }
}

async function saveDb(db: Database): Promise<Database> {
  db.updatedAt = new Date().toISOString();

  if (canUseBlobDb()) {
    writeQueue = writeQueue.then(async () => {
      await writeBlobDb(db);
    });
    await writeQueue;
    return db;
  }

  if (canUseGithubDb()) {
    writeQueue = writeQueue.then(async () => {
      const saved = await writeGithubDb(db, githubSha);
      githubSha = saved.sha;
    });
    await writeQueue;
    return db;
  }

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf8");
  return db;
}

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getDatabase(): Promise<Database> {
  return ensureDb();
}

export async function resetDatabase(): Promise<Database> {
  const seed = createSeedDatabase();
  return saveDb(seed);
}

export function computeStats(db: Database): Stats {
  const thankable = db.people;
  const assignedRecipientIds = new Set(db.assignments.map((a) => a.recipientId));
  const completedRecipientIds = new Set(
    db.assignments.filter((a) => a.status === "done").map((a) => a.recipientId),
  );

  return {
    totalRecipients: thankable.length,
    assignedRecipients: thankable.filter((p) => assignedRecipientIds.has(p.id))
      .length,
    completedRecipients: thankable.filter((p) =>
      completedRecipientIds.has(p.id),
    ).length,
    pendingAssignments: db.assignments.filter((a) => a.status === "pending")
      .length,
    doneAssignments: db.assignments.filter((a) => a.status === "done").length,
    unassignedRecipients: thankable.filter(
      (p) => !assignedRecipientIds.has(p.id),
    ).length,
    additionalThanksNeeded: db.assignments.filter(
      (a) => a.needsAdditionalThanks && a.status === "done",
    ).length,
  };
}

export async function addRole(name: string): Promise<Role> {
  const db = await ensureDb();
  const maxOrder = db.roles.reduce((m, r) => Math.max(m, r.sortOrder), 0);
  const role: Role = {
    id: uid("role"),
    name: name.trim(),
    sortOrder: maxOrder + 1,
  };
  db.roles.push(role);
  await saveDb(db);
  return role;
}

export async function updateRole(
  roleId: string,
  patch: Partial<Pick<Role, "name" | "sortOrder">>,
): Promise<Role> {
  const db = await ensureDb();
  const role = db.roles.find((r) => r.id === roleId);
  if (!role) throw new Error("התפקיד לא נמצא");
  if (patch.name !== undefined) role.name = patch.name.trim();
  if (patch.sortOrder !== undefined) role.sortOrder = patch.sortOrder;
  await saveDb(db);
  return role;
}

export async function deleteRole(roleId: string): Promise<void> {
  const db = await ensureDb();
  if (db.people.some((p) => p.roleId === roleId)) {
    throw new Error("לא ניתן למחוק תפקיד שמשויכים אליו אנשים");
  }
  db.roles = db.roles.filter((r) => r.id !== roleId);
  await saveDb(db);
}

export async function addPerson(input: {
  name: string;
  roleId: string;
  isSenior?: boolean;
  phone?: string;
  notes?: string;
}): Promise<Person> {
  const db = await ensureDb();
  if (!db.roles.some((r) => r.id === input.roleId)) {
    throw new Error("התפקיד לא נמצא");
  }
  const name = input.name.trim();
  const person: Person = {
    id: uid("person"),
    name,
    roleId: input.roleId,
    isSenior: Boolean(input.isSenior),
    isAdmin: name === ADMIN_NAME,
    phone: input.phone?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
  };
  db.people.push(person);
  await saveDb(db);
  return person;
}

export async function updatePerson(
  personId: string,
  patch: Partial<
    Pick<Person, "name" | "roleId" | "isSenior" | "phone" | "notes">
  >,
): Promise<Person> {
  const db = await ensureDb();
  const person = db.people.find((p) => p.id === personId);
  if (!person) throw new Error("האדם לא נמצא");
  if (patch.name !== undefined) person.name = patch.name.trim();
  if (patch.roleId !== undefined) {
    if (!db.roles.some((r) => r.id === patch.roleId)) {
      throw new Error("התפקיד לא נמצא");
    }
    person.roleId = patch.roleId;
  }
  if (patch.isSenior !== undefined) person.isSenior = patch.isSenior;
  if (patch.phone !== undefined) person.phone = patch.phone.trim() || undefined;
  if (patch.notes !== undefined) person.notes = patch.notes.trim() || undefined;
  person.isAdmin = person.name === ADMIN_NAME;
  await saveDb(db);
  return person;
}

export async function deletePerson(personId: string): Promise<void> {
  const db = await ensureDb();
  db.people = db.people.filter((p) => p.id !== personId);
  db.assignments = db.assignments.filter(
    (a) => a.assigneeId !== personId && a.recipientId !== personId,
  );
  await saveDb(db);
}

export async function createAssignment(input: {
  assigneeId: string;
  recipientId: string;
}): Promise<Assignment> {
  const db = await ensureDb();
  const assignee = db.people.find((p) => p.id === input.assigneeId);
  const recipient = db.people.find((p) => p.id === input.recipientId);
  if (!assignee || !recipient) throw new Error("אדם לא נמצא");
  if (!assignee.isSenior) throw new Error("רק צוות בכיר יכול לקבל שיוך לתודה");
  if (assignee.id === recipient.id) throw new Error("לא ניתן לשייך אדם לעצמו");

  const exists = db.assignments.find(
    (a) =>
      a.assigneeId === input.assigneeId && a.recipientId === input.recipientId,
  );
  if (exists) throw new Error("השיוך כבר קיים");

  const now = new Date().toISOString();
  const assignment: Assignment = {
    id: uid("assign"),
    assigneeId: input.assigneeId,
    recipientId: input.recipientId,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  db.assignments.push(assignment);
  await saveDb(db);
  return assignment;
}

export async function createAssignmentsBulk(input: {
  assigneeId: string;
  recipientIds: string[];
}): Promise<Assignment[]> {
  const created: Assignment[] = [];
  for (const recipientId of input.recipientIds) {
    try {
      created.push(
        await createAssignment({
          assigneeId: input.assigneeId,
          recipientId,
        }),
      );
    } catch {
      // skip duplicates / invalid
    }
  }
  return created;
}

export async function updateAssignment(
  assignmentId: string,
  patch: {
    status?: Assignment["status"];
    contactMethod?: ContactMethod | null;
    feedback?: string;
    needsAdditionalThanks?: boolean;
    additionalThankerIds?: string[];
    additionalThankerNote?: string;
    assigneeId?: string;
  },
): Promise<Assignment> {
  const db = await ensureDb();
  const assignment = db.assignments.find((a) => a.id === assignmentId);
  if (!assignment) throw new Error("השיוך לא נמצא");

  if (patch.assigneeId !== undefined) {
    const assignee = db.people.find((p) => p.id === patch.assigneeId);
    if (!assignee?.isSenior) throw new Error("המשויך חייב להיות מהצוות הבכיר");
    assignment.assigneeId = patch.assigneeId;
  }
  if (patch.contactMethod !== undefined) {
    assignment.contactMethod = patch.contactMethod;
  }
  if (patch.feedback !== undefined) assignment.feedback = patch.feedback.trim();
  if (patch.needsAdditionalThanks !== undefined) {
    assignment.needsAdditionalThanks = patch.needsAdditionalThanks;
  }
  if (patch.additionalThankerIds !== undefined) {
    assignment.additionalThankerIds = patch.additionalThankerIds;
  }
  if (patch.additionalThankerNote !== undefined) {
    assignment.additionalThankerNote = patch.additionalThankerNote.trim();
  }
  if (patch.status !== undefined) {
    assignment.status = patch.status;
    assignment.completedAt =
      patch.status === "done" ? new Date().toISOString() : null;
  }

  assignment.updatedAt = new Date().toISOString();
  await saveDb(db);
  return assignment;
}

export async function deleteAssignment(assignmentId: string): Promise<void> {
  const db = await ensureDb();
  db.assignments = db.assignments.filter((a) => a.id !== assignmentId);
  await saveDb(db);
}

export async function autoDistribute(): Promise<Assignment[]> {
  const db = await ensureDb();
  const seniorList = db.people.filter((p) => p.isSenior);
  const assigned = new Set(db.assignments.map((a) => a.recipientId));
  const unassigned = db.people.filter((p) => !p.isSenior && !assigned.has(p.id));

  if (seniorList.length === 0 || unassigned.length === 0) return [];

  const load = new Map<string, number>();
  for (const s of seniorList) {
    load.set(
      s.id,
      db.assignments.filter((a) => a.assigneeId === s.id && a.status === "pending")
        .length,
    );
  }

  const created: Assignment[] = [];
  for (const recipient of unassigned) {
    let best = seniorList[0];
    let bestLoad = load.get(best.id) ?? 0;
    for (const senior of seniorList) {
      const current = load.get(senior.id) ?? 0;
      if (current < bestLoad) {
        best = senior;
        bestLoad = current;
      }
    }
    const assignment = await createAssignment({
      assigneeId: best.id,
      recipientId: recipient.id,
    });
    created.push(assignment);
    load.set(best.id, bestLoad + 1);
  }
  return created;
}
