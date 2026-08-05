"use client";

import { useMemo, useState } from "react";
import type { DbResponse } from "@/lib/api";
import {
  claimAssignmentApi,
  createClaimRequestApi,
  releaseAssignmentApi,
} from "@/lib/api";
import { personById, roleName, sortedRoles } from "@/lib/helpers";
import type { Person } from "@/lib/types";

type ClaimBoardProps = {
  db: DbResponse;
  user: Person;
  pending: boolean;
  onAction: (action: () => Promise<void>) => void;
};

type FilterMode = "all" | "free" | "taken" | "mine";

export function ClaimBoard({ db, user, pending, onAction }: ClaimBoardProps) {
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [mode, setMode] = useState<FilterMode>("all");
  const [requestNote, setRequestNote] = useState<Record<string, string>>({});
  const [openRequestFor, setOpenRequestFor] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = query.trim();
    return db.people
      .filter((person) => person.id !== user.id)
      .filter((person) => (roleFilter === "all" ? true : person.roleId === roleFilter))
      .filter((person) => (q ? person.name.includes(q) : true))
      .map((person) => {
        const holders = db.assignments.filter((a) => a.recipientId === person.id);
        const mine = holders.find((a) => a.assigneeId === user.id);
        const others = holders.filter((a) => a.assigneeId !== user.id);
        const myPendingRequest = (db.claimRequests ?? []).find(
          (r) =>
            r.status === "pending" &&
            r.requesterId === user.id &&
            r.recipientId === person.id,
        );
        return { person, holders, mine, others, myPendingRequest };
      })
      .filter((row) => {
        if (mode === "free") return row.holders.length === 0;
        if (mode === "taken") return row.holders.length > 0 && !row.mine;
        if (mode === "mine") return Boolean(row.mine);
        return true;
      })
      .sort((a, b) => {
        // Free first, then mine, then taken
        const score = (row: typeof a) => {
          if (row.holders.length === 0) return 0;
          if (row.mine) return 1;
          return 2;
        };
        const diff = score(a) - score(b);
        if (diff !== 0) return diff;
        return a.person.name.localeCompare(b.person.name, "he");
      });
  }, [db, user.id, query, roleFilter, mode]);

  const freeCount = db.people.filter(
    (p) =>
      p.id !== user.id &&
      !db.assignments.some((a) => a.recipientId === p.id),
  ).length;

  return (
    <section className="animate-rise space-y-5">
      <div className="panel rounded-[28px] p-5 sm:p-6">
        <h2 className="brand-display text-2xl font-bold text-maroon">
          לוקחים תודות
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
          בחרו בעצמכם למי להודות. אם מישהו כבר לקח — אפשר להגיש לו בקשה
          להצטרף גם לתודה הזו.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <span className="chip chip-pending">{freeCount} פנויים</span>
          <span className="chip chip-done">
            {db.stats.assignedRecipients} כבר נלקחו
          </span>
          <span className="chip chip-warn">
            {db.stats.openClaimRequests} בקשות פתוחות
          </span>
        </div>
      </div>

      <div className="panel rounded-[28px] p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            className="field"
            placeholder="חיפוש לפי שם…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className="field"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="all">כל התפקידים</option>
            {sortedRoles(db).map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
          <select
            className="field"
            value={mode}
            onChange={(e) => setMode(e.target.value as FilterMode)}
          >
            <option value="all">הכול</option>
            <option value="free">פנויים בלבד</option>
            <option value="taken">תפוסים אצל אחרים</option>
            <option value="mine">מה שלקחתי</option>
          </select>
        </div>
      </div>

      <div className="space-y-3">
        {rows.length === 0 ? (
          <div className="panel rounded-[28px] p-8 text-center text-muted">
            אין תוצאות לסינון הזה
          </div>
        ) : (
          rows.map(({ person, holders, mine, others, myPendingRequest }) => (
            <article
              key={person.id}
              className="panel rounded-[24px] p-4 transition hover:-translate-y-0.5 sm:p-5"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-bold text-ink">{person.name}</h3>
                    {holders.length === 0 ? (
                      <span className="chip chip-pending">פנוי</span>
                    ) : mine ? (
                      <span className="chip chip-done">אצלי</span>
                    ) : (
                      <span className="chip chip-warn">תפוס</span>
                    )}
                    {person.isSenior && (
                      <span className="chip chip-warn">בכיר</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {roleName(db, person.roleId)}
                    {person.phone ? ` · ${person.phone}` : ""}
                  </p>
                  {others.length > 0 && (
                    <p className="mt-2 text-sm text-muted">
                      אצל:{" "}
                      {others
                        .map((a) => personById(db, a.assigneeId)?.name)
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  )}
                  {myPendingRequest && (
                    <p className="mt-2 text-sm font-semibold text-maroon">
                      בקשה ממתינה לאישור
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-2 sm:min-w-[220px]">
                  {!mine && holders.length === 0 && (
                    <button
                      className="btn btn-secondary"
                      disabled={pending}
                      onClick={() =>
                        onAction(async () => {
                          await claimAssignmentApi(person.id);
                        })
                      }
                    >
                      {pending ? "שומר…" : "לוקח על עצמי"}
                    </button>
                  )}

                  {mine && mine.status === "pending" && (
                    <button
                      className="btn btn-ghost"
                      disabled={pending}
                      onClick={() =>
                        onAction(async () => {
                          await releaseAssignmentApi(mine.id);
                        })
                      }
                    >
                      {pending ? "משחרר…" : "שחרור מהרשימה שלי"}
                    </button>
                  )}

                  {!mine && others.length > 0 && !myPendingRequest && (
                    <>
                      {openRequestFor === person.id ? (
                        <div className="space-y-2 rounded-2xl border border-[var(--line)] bg-white/70 p-3">
                          <p className="text-xs font-semibold text-maroon">
                            בקשה להצטרף לתודה
                          </p>
                          <select
                            className="field"
                            id={`target-${person.id}`}
                            defaultValue={others[0]?.assigneeId}
                          >
                            {others.map((a) => (
                              <option key={a.id} value={a.assigneeId}>
                                אל {personById(db, a.assigneeId)?.name}
                              </option>
                            ))}
                          </select>
                          <input
                            className="field"
                            placeholder="הודעה קצרה (אופציונלי)"
                            value={requestNote[person.id] ?? ""}
                            onChange={(e) =>
                              setRequestNote((prev) => ({
                                ...prev,
                                [person.id]: e.target.value,
                              }))
                            }
                          />
                          <div className="flex gap-2">
                            <button
                              className="btn btn-primary flex-1 !py-2 text-sm"
                              disabled={pending}
                              onClick={() => {
                                const select = document.getElementById(
                                  `target-${person.id}`,
                                ) as HTMLSelectElement | null;
                                const targetAssigneeId =
                                  select?.value || others[0]?.assigneeId;
                                if (!targetAssigneeId) return;
                                onAction(async () => {
                                  await createClaimRequestApi({
                                    recipientId: person.id,
                                    targetAssigneeId,
                                    note: requestNote[person.id],
                                  });
                                  setOpenRequestFor(null);
                                });
                              }}
                            >
                              שליחת בקשה
                            </button>
                            <button
                              className="btn btn-ghost !py-2 text-sm"
                              onClick={() => setOpenRequestFor(null)}
                            >
                              ביטול
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className="btn btn-primary"
                          disabled={pending}
                          onClick={() => setOpenRequestFor(person.id)}
                        >
                          בקשה להצטרף גם
                        </button>
                      )}
                    </>
                  )}

                  {mine && holders.length > 1 && (
                    <p className="text-xs text-muted">
                      עוד {holders.length - 1} מודים גם
                    </p>
                  )}
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
