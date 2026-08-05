import { promises as fs } from "fs";
import path from "path";
import {
  BlobConflictError,
  canUseBlobDb,
  readBlobDb,
  writeBlobDb,
} from "./blob-db";
import { canUseGithubDb, readGithubDb, writeGithubDb } from "./github-db";
import {
  DEFAULT_SENIOR_PASSWORDS,
  hashPassword,
  SENIOR_NAMES,
  verifyPassword,
} from "./passwords";
import {
  readDefaultDatabase,
  writeDefaultDatabase,
} from "./default-db";
import { createSeedDatabase } from "./seed";
import { isUnavailableStorageError } from "./storage-errors";
import {
  ADMIN_NAME,
  type Assignment,
  type ClaimRequest,
  type ContactMethod,
  type Database,
  type Person,
  type Role,
  type Stats,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "db.json");
/** Writable fallback on serverless when Blob/GitHub are unavailable. */
const TMP_DB_PATH = path.join("/tmp", "todot-db.json");
const MAX_MUTATION_RETRIES = 12;

let githubSha: string | null = null;
/** ETag of the last Blob read/write on this instance (for conditional puts). */
let blobEtag: string | null = null;
/** When Blob is suspended/blocked, skip it for the rest of this instance. */
let blobDisabled = false;
/** Serializes read-modify-write so concurrent handlers on one instance cannot stomp each other. */
let mutationChain: Promise<unknown> = Promise.resolve();
/** Last good DB kept in memory so reads still work if remotes die mid-flight. */
let memoryDb: Database | null = null;

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizePeople(db: Database): boolean {
  let changed = false;
  if (!Array.isArray(db.claimRequests)) {
    db.claimRequests = [];
    changed = true;
  }
  if (typeof db.revision !== "number") {
    db.revision = 1;
    changed = true;
  }

  for (const person of db.people) {
    const shouldAdmin = person.name === ADMIN_NAME;
    if (Boolean(person.isAdmin) !== shouldAdmin) {
      person.isAdmin = shouldAdmin;
      changed = true;
    }
    const shouldSenior = SENIOR_NAMES.has(person.name);
    if (Boolean(person.isSenior) !== shouldSenior) {
      person.isSenior = shouldSenior;
      changed = true;
    }

    if (shouldSenior) {
      const defaultPassword = DEFAULT_SENIOR_PASSWORDS[person.name];
      if (!person.passwordHash && defaultPassword) {
        person.passwordHash = hashPassword(defaultPassword);
        person.usesDefaultPassword = true;
        changed = true;
      }
    } else if (person.passwordHash || person.usesDefaultPassword) {
      delete person.passwordHash;
      delete person.usesDefaultPassword;
      changed = true;
    }
  }

  // Ensure every assignee has contiguous priorities for their list.
  const byAssignee = new Map<string, Assignment[]>();
  for (const assignment of db.assignments) {
    const list = byAssignee.get(assignment.assigneeId) ?? [];
    list.push(assignment);
    byAssignee.set(assignment.assigneeId, list);
  }
  for (const list of byAssignee.values()) {
    list.sort((a, b) => {
      const pa = a.priority ?? Number.MAX_SAFE_INTEGER;
      const pb = b.priority ?? Number.MAX_SAFE_INTEGER;
      if (pa !== pb) return pa - pb;
      return a.createdAt.localeCompare(b.createdAt);
    });
    list.forEach((assignment, index) => {
      if (assignment.priority !== index + 1) {
        assignment.priority = index + 1;
        changed = true;
      }
    });
  }

  return changed;
}

async function readLocalDbFile(): Promise<Database | null> {
  for (const filePath of [TMP_DB_PATH, DB_PATH]) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      return JSON.parse(raw) as Database;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function readRawDb(): Promise<Database> {
  if (canUseBlobDb() && !blobDisabled) {
    try {
      const { db, etag } = await readBlobDb();
      blobEtag = etag;
      memoryDb = db;
      return db;
    } catch (error) {
      if (isUnavailableStorageError(error)) {
        blobDisabled = true;
      } else {
        throw error;
      }
    }
  }

  if (canUseGithubDb()) {
    try {
      const { db, sha } = await readGithubDb();
      githubSha = sha;
      memoryDb = db;
      return db;
    } catch (error) {
      if (!isUnavailableStorageError(error)) throw error;
    }
  }

  const local = await readLocalDbFile();
  if (local) {
    memoryDb = local;
    return local;
  }

  if (memoryDb) return structuredClone(memoryDb);

  const seed = createSeedDatabase();
  memoryDb = seed;
  return seed;
}

async function writeRawDb(db: Database): Promise<void> {
  db.updatedAt = new Date().toISOString();
  db.revision = (db.revision ?? 0) + 1;
  db.writeToken = uid("w");
  memoryDb = db;

  if (canUseBlobDb() && !blobDisabled) {
    try {
      const saved = await writeBlobDb(db, blobEtag);
      blobEtag = saved.etag;
      return;
    } catch (error) {
      if (isUnavailableStorageError(error)) {
        blobDisabled = true;
      } else if (error instanceof BlobConflictError) {
        throw error;
      } else {
        throw error;
      }
    }
  }

  if (canUseGithubDb()) {
    try {
      const saved = await writeGithubDb(db, githubSha);
      githubSha = saved.sha;
      return;
    } catch (error) {
      if (!isUnavailableStorageError(error)) throw error;
    }
  }

  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf8");
    return;
  } catch {
    /* serverless filesystems are often read-only — use /tmp */
  }

  await fs.writeFile(TMP_DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

/**
 * Read-only load. Normalizes in memory but does NOT write.
 * Persisting normalization happens only inside mutateDb.
 */
async function loadDb(): Promise<Database> {
  const db = await readRawDb();
  normalizePeople(db);
  return db;
}

/**
 * Serialize mutations on this instance: read → mutate → conditional write.
 * Retries when another instance changed the Blob (ETag mismatch).
 */
async function mutateDb<T>(fn: (db: Database) => T | Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_MUTATION_RETRIES; attempt++) {
      const db = await loadDb();
      const result = await fn(db);
      normalizePeople(db);

      try {
        await writeRawDb(db);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const conflict =
          error instanceof BlobConflictError ||
          (error instanceof Error && error.message === "BLOB_CONFLICT");
        // Conflict: re-read latest and retry the whole mutation.
        // Other put errors: brief backoff then retry.
        await new Promise((resolve) =>
          setTimeout(resolve, conflict ? 30 * (attempt + 1) : 80 * (attempt + 1)),
        );
      }
    }

    const conflict =
      lastError instanceof BlobConflictError ||
      (lastError instanceof Error && lastError.message === "BLOB_CONFLICT");
    throw new Error(
      conflict
        ? "מישהו אחר עדכן במקביל. נסו שוב"
        : lastError?.message || "לא הצלחנו לשמור את השינוי. נסו שוב בעוד רגע",
    );
  };

  const next = mutationChain.then(run, run);
  mutationChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export async function getDatabase(): Promise<Database> {
  return loadDb();
}

/** Public-safe person object (no password hash). */
export function publicPerson(person: Person): Person {
  const { passwordHash: _passwordHash, ...rest } = person;
  return rest;
}

export function publicDatabase(db: Database): Database {
  return {
    ...db,
    people: db.people.map(publicPerson),
  };
}

export async function authenticateSenior(
  userId: string,
  password: string,
): Promise<Person> {
  const db = await loadDb();
  const user = db.people.find((p) => p.id === userId && p.isSenior);
  if (!user?.passwordHash) {
    throw new Error("משתמש לא נמצא או שאין לו סיסמה");
  }
  if (!verifyPassword(password, user.passwordHash)) {
    throw new Error("סיסמה שגויה");
  }
  return publicPerson(user);
}

export async function setPersonPassword(input: {
  personId: string;
  password: string;
  asDefault?: boolean;
}): Promise<Person> {
  return mutateDb((db) => {
    const person = db.people.find((p) => p.id === input.personId);
    if (!person?.isSenior) throw new Error("ניתן להגדיר סיסמה רק לצוות בכיר");
    const password = input.password.trim();
    if (password.length < 4) throw new Error("הסיסמה חייבת להכיל לפחות 4 תווים");
    person.passwordHash = hashPassword(password);
    person.usesDefaultPassword = Boolean(input.asDefault);
    return publicPerson(person);
  });
}

async function loadResetSource(): Promise<Database> {
  const saved = await readDefaultDatabase();
  return saved ?? createSeedDatabase();
}

/** Save the current live database as the system default for future resets. */
export async function saveCurrentAsDefault(): Promise<{
  savedAt: string;
  assignmentCount: number;
  peopleCount: number;
}> {
  const db = await loadDb();
  const saved = await writeDefaultDatabase(db);
  return {
    savedAt: saved.updatedAt,
    assignmentCount: saved.assignments.length,
    peopleCount: saved.people.length,
  };
}

export async function resetDatabase(): Promise<Database> {
  const seed = await loadResetSource();
  return mutateDb((db) => {
    db.roles = seed.roles;
    db.people = seed.people;
    db.assignments = seed.assignments;
    db.claimRequests = seed.claimRequests ?? [];
    db.revision = seed.revision ?? 1;
    return db;
  });
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
    openClaimRequests: (db.claimRequests ?? []).filter(
      (r) => r.status === "pending",
    ).length,
  };
}

export async function addRole(name: string): Promise<Role> {
  return mutateDb((db) => {
    const maxOrder = db.roles.reduce((m, r) => Math.max(m, r.sortOrder), 0);
    const role: Role = {
      id: uid("role"),
      name: name.trim(),
      sortOrder: maxOrder + 1,
    };
    db.roles.push(role);
    return role;
  });
}

export async function updateRole(
  roleId: string,
  patch: Partial<Pick<Role, "name" | "sortOrder">>,
): Promise<Role> {
  return mutateDb((db) => {
    const role = db.roles.find((r) => r.id === roleId);
    if (!role) throw new Error("התפקיד לא נמצא");
    if (patch.name !== undefined) role.name = patch.name.trim();
    if (patch.sortOrder !== undefined) role.sortOrder = patch.sortOrder;
    return role;
  });
}

export async function deleteRole(roleId: string): Promise<void> {
  await mutateDb((db) => {
    if (db.people.some((p) => p.roleId === roleId)) {
      throw new Error("לא ניתן למחוק תפקיד שמשויכים אליו אנשים");
    }
    db.roles = db.roles.filter((r) => r.id !== roleId);
  });
}

export async function addPerson(input: {
  name: string;
  roleId: string;
  isSenior?: boolean;
  phone?: string;
  notes?: string;
}): Promise<Person> {
  return mutateDb((db) => {
    if (!db.roles.some((r) => r.id === input.roleId)) {
      throw new Error("התפקיד לא נמצא");
    }
    const name = input.name.trim();
    const isSenior = SENIOR_NAMES.has(name);
    const defaultPassword = DEFAULT_SENIOR_PASSWORDS[name];
    const person: Person = {
      id: uid("person"),
      name,
      roleId: input.roleId,
      isSenior,
      isAdmin: name === ADMIN_NAME,
      phone: input.phone?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      passwordHash:
        isSenior && defaultPassword ? hashPassword(defaultPassword) : undefined,
      usesDefaultPassword: isSenior && defaultPassword ? true : undefined,
    };
    db.people.push(person);
    return publicPerson(person);
  });
}

export async function updatePerson(
  personId: string,
  patch: Partial<
    Pick<Person, "name" | "roleId" | "isSenior" | "phone" | "notes">
  >,
): Promise<Person> {
  return mutateDb((db) => {
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
    person.isSenior = SENIOR_NAMES.has(person.name);
    if (person.isSenior && !person.passwordHash) {
      const defaultPassword = DEFAULT_SENIOR_PASSWORDS[person.name];
      if (defaultPassword) {
        person.passwordHash = hashPassword(defaultPassword);
        person.usesDefaultPassword = true;
      }
    }
    if (!person.isSenior) {
      delete person.passwordHash;
      delete person.usesDefaultPassword;
    }
    return publicPerson(person);
  });
}

export async function deletePerson(personId: string): Promise<void> {
  await mutateDb((db) => {
    db.people = db.people.filter((p) => p.id !== personId);
    db.assignments = db.assignments.filter(
      (a) => a.assigneeId !== personId && a.recipientId !== personId,
    );
    db.claimRequests = (db.claimRequests ?? []).filter(
      (r) =>
        r.requesterId !== personId &&
        r.targetAssigneeId !== personId &&
        r.recipientId !== personId,
    );
  });
}

function createAssignmentInDb(
  db: Database,
  input: { assigneeId: string; recipientId: string },
): Assignment {
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
  const maxPriority = db.assignments
    .filter((a) => a.assigneeId === input.assigneeId)
    .reduce((max, a) => Math.max(max, a.priority ?? 0), 0);
  const assignment: Assignment = {
    id: uid("assign"),
    assigneeId: input.assigneeId,
    recipientId: input.recipientId,
    status: "pending",
    priority: maxPriority + 1,
    createdAt: now,
    updatedAt: now,
  };
  db.assignments.push(assignment);
  return assignment;
}

export async function createAssignment(input: {
  assigneeId: string;
  recipientId: string;
}): Promise<Assignment> {
  return mutateDb((db) => createAssignmentInDb(db, input));
}

export async function claimForSelf(input: {
  userId: string;
  recipientId: string;
}): Promise<Assignment> {
  return mutateDb((db) => {
    const user = db.people.find((p) => p.id === input.userId);
    if (!user?.isSenior) throw new Error("רק צוות בכיר יכול לקחת תודה");
    const existing = db.assignments.find(
      (a) =>
        a.assigneeId === input.userId && a.recipientId === input.recipientId,
    );
    if (existing) return existing;
    return createAssignmentInDb(db, {
      assigneeId: input.userId,
      recipientId: input.recipientId,
    });
  });
}

export async function releaseOwnAssignment(input: {
  userId: string;
  assignmentId: string;
  isAdmin?: boolean;
}): Promise<void> {
  await mutateDb((db) => {
    const assignment = db.assignments.find((a) => a.id === input.assignmentId);
    // Idempotent: already released / missing is success.
    if (!assignment) return;
    if (!input.isAdmin && assignment.assigneeId !== input.userId) {
      throw new Error("ניתן לשחרר רק משימה שלך");
    }
    if (assignment.status === "done" && !input.isAdmin) {
      throw new Error("לא ניתן לשחרר משימה שכבר בוצעה");
    }
    db.assignments = db.assignments.filter((a) => a.id !== input.assignmentId);
    db.claimRequests = (db.claimRequests ?? []).filter(
      (r) =>
        !(
          r.status === "pending" &&
          r.recipientId === assignment.recipientId &&
          r.targetAssigneeId === assignment.assigneeId
        ),
    );
  });
}

export async function reorderOwnPriorities(input: {
  userId: string;
  assignmentIds: string[];
}): Promise<Assignment[]> {
  return mutateDb((db) => {
    const mine = db.assignments.filter((a) => a.assigneeId === input.userId);
    const mineIds = new Set(mine.map((a) => a.id));
    if (
      input.assignmentIds.length !== mine.length ||
      input.assignmentIds.some((id) => !mineIds.has(id))
    ) {
      throw new Error("רשימת העדיפויות לא תואמת את המשימות שלך");
    }
    input.assignmentIds.forEach((id, index) => {
      const assignment = db.assignments.find((a) => a.id === id);
      if (assignment) {
        assignment.priority = index + 1;
        assignment.updatedAt = new Date().toISOString();
      }
    });
    return db.assignments
      .filter((a) => a.assigneeId === input.userId)
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  });
}

export async function createClaimRequest(input: {
  requesterId: string;
  recipientId: string;
  targetAssigneeId: string;
  note?: string;
}): Promise<ClaimRequest> {
  return mutateDb((db) => {
    const requester = db.people.find((p) => p.id === input.requesterId);
    const target = db.people.find((p) => p.id === input.targetAssigneeId);
    const recipient = db.people.find((p) => p.id === input.recipientId);
    if (!requester?.isSenior || !target?.isSenior || !recipient) {
      throw new Error("בקשה לא תקינה");
    }
    if (requester.id === target.id) {
      throw new Error("אין צורך לבקש מעצמך");
    }
    if (requester.id === recipient.id) {
      throw new Error("לא ניתן לבקש להודות לעצמך");
    }

    const targetHas = db.assignments.some(
      (a) =>
        a.assigneeId === input.targetAssigneeId &&
        a.recipientId === input.recipientId,
    );
    if (!targetHas) {
      throw new Error("האדם שבחרת לא מחזיק את התודה הזו");
    }

    const alreadyMine = db.assignments.some(
      (a) =>
        a.assigneeId === input.requesterId &&
        a.recipientId === input.recipientId,
    );
    if (alreadyMine) throw new Error("כבר לקחת את התודה הזו");

    const pendingExists = (db.claimRequests ?? []).some(
      (r) =>
        r.status === "pending" &&
        r.requesterId === input.requesterId &&
        r.recipientId === input.recipientId &&
        r.targetAssigneeId === input.targetAssigneeId,
    );
    if (pendingExists) throw new Error("כבר שלחת בקשה ממתינה");

    const now = new Date().toISOString();
    const request: ClaimRequest = {
      id: uid("claim"),
      recipientId: input.recipientId,
      requesterId: input.requesterId,
      targetAssigneeId: input.targetAssigneeId,
      note: input.note?.trim() || undefined,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    db.claimRequests = db.claimRequests ?? [];
    db.claimRequests.push(request);
    return request;
  });
}

export async function respondClaimRequest(input: {
  requestId: string;
  actorId: string;
  approve: boolean;
  isAdmin?: boolean;
}): Promise<{ request: ClaimRequest; assignment?: Assignment }> {
  return mutateDb((db) => {
    const request = (db.claimRequests ?? []).find(
      (r) => r.id === input.requestId,
    );
    if (!request) throw new Error("הבקשה לא נמצאה");
    if (request.status !== "pending") throw new Error("הבקשה כבר טופלה");

    const canRespond =
      input.isAdmin ||
      request.targetAssigneeId === input.actorId ||
      request.requesterId === input.actorId;
    if (!canRespond) throw new Error("אין הרשאה לטפל בבקשה");

    if (
      request.requesterId === input.actorId &&
      !input.isAdmin &&
      request.targetAssigneeId !== input.actorId &&
      input.approve
    ) {
      throw new Error("רק מי שמחזיק את התודה יכול לאשר");
    }

    const now = new Date().toISOString();
    if (!input.approve) {
      request.status = "rejected";
      request.updatedAt = now;
      return { request };
    }

    request.status = "approved";
    request.updatedAt = now;
    const assignment = createAssignmentInDb(db, {
      assigneeId: request.requesterId,
      recipientId: request.recipientId,
    });
    return { request, assignment };
  });
}

export async function createAssignmentsBulk(input: {
  assigneeId: string;
  recipientIds: string[];
}): Promise<Assignment[]> {
  return mutateDb((db) => {
    const created: Assignment[] = [];
    for (const recipientId of input.recipientIds) {
      try {
        created.push(
          createAssignmentInDb(db, {
            assigneeId: input.assigneeId,
            recipientId,
          }),
        );
      } catch {
        // skip duplicates / invalid
      }
    }
    return created;
  });
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
  return mutateDb((db) => {
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
    return assignment;
  });
}

export async function deleteAssignment(assignmentId: string): Promise<void> {
  await mutateDb((db) => {
    db.assignments = db.assignments.filter((a) => a.id !== assignmentId);
  });
}

export async function autoDistribute(): Promise<Assignment[]> {
  return mutateDb((db) => {
    const seniorList = db.people.filter((p) => p.isSenior);
    const assigned = new Set(db.assignments.map((a) => a.recipientId));
    const unassigned = db.people.filter(
      (p) => !p.isSenior && !assigned.has(p.id),
    );

    if (seniorList.length === 0 || unassigned.length === 0) return [];

    const load = new Map<string, number>();
    for (const s of seniorList) {
      load.set(
        s.id,
        db.assignments.filter(
          (a) => a.assigneeId === s.id && a.status === "pending",
        ).length,
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
      const assignment = createAssignmentInDb(db, {
        assigneeId: best.id,
        recipientId: recipient.id,
      });
      created.push(assignment);
      load.set(best.id, bestLoad + 1);
      assigned.add(recipient.id);
    }
    return created;
  });
}
