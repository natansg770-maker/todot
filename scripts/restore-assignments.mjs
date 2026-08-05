import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { createRequire } from "module";

// Load seed via tsx-compiled path by spawning is heavy; duplicate minimal restore
// using current data/db.json people as target roster base from production + seed file.
const require = createRequire(import.meta.url);

const backups = [
  JSON.parse(readFileSync("/tmp/db.json", "utf8")),
  JSON.parse(readFileSync("/tmp/db-seed.json", "utf8")),
  JSON.parse(execSync("git show 1b1a526:data/db.json").toString()),
];
backups.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
const source = backups[0];
console.log(
  "Using backup updatedAt",
  source.updatedAt,
  "assignments",
  source.assignments.length,
);

const prod = await (await fetch("https://todot-camp.vercel.app/api/db")).json();
// Current production has the full 92-person roster with phones; use it as people base.
// Password hashes aren't in public API, so pull people from local seed file written earlier
// if available, else keep prod people and merge hashes from backup by name.
let freshPeople;
try {
  const local = JSON.parse(readFileSync("data/db.json", "utf8"));
  freshPeople = local.people;
} catch {
  freshPeople = prod.people;
}

// Prefer people from latest local seed commit content if phones exist
if (!freshPeople.some((p) => p.phone)) {
  freshPeople = prod.people;
}

const byNameOld = new Map();
for (const p of source.people) {
  const list = byNameOld.get(p.name) || [];
  list.push(p);
  byNameOld.set(p.name, list);
}
const byNameNew = new Map();
for (const p of freshPeople) {
  const list = byNameNew.get(p.name) || [];
  list.push(p);
  byNameNew.set(p.name, list);
}

const idMap = new Map();
const unmatchedOld = [];
for (const [name, oldList] of byNameOld) {
  const newList = byNameNew.get(name) || [];
  const n = Math.min(oldList.length, newList.length);
  for (let i = 0; i < n; i++) {
    idMap.set(oldList[i].id, newList[i].id);
    if (oldList[i].passwordHash) {
      newList[i].passwordHash = oldList[i].passwordHash;
      newList[i].usesDefaultPassword = oldList[i].usesDefaultPassword;
    }
  }
  if (oldList.length > newList.length) {
    unmatchedOld.push({ name, missing: oldList.length - newList.length });
  }
}

let mapped = 0;
let skipped = 0;
const assignments = [];
const seen = new Set();
for (const a of source.assignments) {
  const assigneeId = idMap.get(a.assigneeId);
  const recipientId = idMap.get(a.recipientId);
  if (!assigneeId || !recipientId) {
    skipped++;
    console.log("skip", a.id, a.assigneeId, a.recipientId);
    continue;
  }
  const key = `${assigneeId}|${recipientId}`;
  if (seen.has(key)) {
    skipped++;
    continue;
  }
  seen.add(key);
  assignments.push({
    ...a,
    assigneeId,
    recipientId,
    additionalThankerIds: (a.additionalThankerIds || [])
      .map((id) => idMap.get(id))
      .filter(Boolean),
  });
  mapped++;
}

for (const a of prod.assignments || []) {
  const key = `${a.assigneeId}|${a.recipientId}`;
  if (!seen.has(key)) {
    assignments.push(a);
    seen.add(key);
    console.log("kept newer prod assignment", a.id);
  }
}

const claimRequests = (source.claimRequests || [])
  .map((r) => ({
    ...r,
    requesterId: idMap.get(r.requesterId),
    targetAssigneeId: idMap.get(r.targetAssigneeId),
    recipientId: idMap.get(r.recipientId),
  }))
  .filter((r) => r.requesterId && r.targetAssigneeId && r.recipientId);

const roles =
  (prod.roles && prod.roles.length ? prod.roles : null) ||
  source.roles ||
  [];

const restored = {
  roles,
  people: freshPeople,
  assignments,
  claimRequests,
  revision: Math.max(Number(source.revision) || 1, Number(prod.revision) || 1, 2) + 1,
  updatedAt: new Date().toISOString(),
};

writeFileSync("/tmp/restored-db.json", JSON.stringify(restored, null, 2));
writeFileSync("data/db.json", JSON.stringify(restored, null, 2));

const nathan = restored.people.find((p) => p.name.includes("נתן שמחה גרינברג"));
console.log({
  people: restored.people.length,
  phones: restored.people.filter((p) => p.phone).length,
  assignments: restored.assignments.length,
  done: restored.assignments.filter((a) => a.status === "done").length,
  claims: restored.claimRequests.length,
  unmatchedOld,
  mapped,
  skipped,
  idMapSize: idMap.size,
  nathanId: nathan?.id,
  nathanAssignments: restored.assignments.filter((a) => a.assigneeId === nathan?.id)
    .length,
});
