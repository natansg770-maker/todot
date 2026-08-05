"use client";

import { useEffect, useMemo, useState } from "react";
import {
  autoDistributeApi,
  changePasswordApi,
  createAssignmentsBulkApi,
  createPerson,
  createRole,
  deleteAssignmentApi,
  deletePersonApi,
  deleteRoleApi,
  fetchDb,
  fetchSeniorPasswordsApi,
  fetchSession,
  releaseAssignmentApi,
  reorderAssignmentsApi,
  resetDbApi,
  resetPasswordApi,
  respondClaimRequestApi,
  setSession,
  updateAssignmentApi,
  updatePersonApi,
  uploadLogoApi,
  type DbResponse,
  type SeniorPasswordInfo,
} from "@/lib/api";
import {
  assignmentsForAssignee,
  contactLabel,
  percent,
  personById,
  recipientCoverage,
  roleName,
  seniors,
  sortedRoles,
  thankablePeople,
} from "@/lib/helpers";
import type { Assignment, ContactMethod, Person } from "@/lib/types";
import { ClaimBoard } from "./ClaimBoard";
import { Logo } from "./Logo";

type Tab = "mine" | "claim" | "overview" | "team" | "admin";

export function AppClient() {
  const [db, setDb] = useState<DbResponse | null>(null);
  const [user, setUser] = useState<Person | null>(null);
  const [tab, setTab] = useState<Tab>("mine");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [activeAssignment, setActiveAssignment] = useState<Assignment | null>(
    null,
  );

  async function refresh() {
    const [nextDb, nextUser] = await Promise.all([fetchDb(), fetchSession()]);
    setDb(nextDb);
    setUser(nextUser);
  }

  useEffect(() => {
    refresh()
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function run(action: () => Promise<void>) {
    setError(null);
    setPending(true);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setPending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="panel animate-rise rounded-3xl px-8 py-10 text-center">
          <Logo size={120} className="logo-float mx-auto mb-4" priority />
          <p className="text-muted">טוען את מערכת התודות…</p>
        </div>
      </div>
    );
  }

  if (!db) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="panel animate-rise rounded-3xl px-8 py-10 text-center">
          <Logo size={120} className="mx-auto mb-4" priority />
          <p className="font-semibold text-maroon">לא הצלחנו לטעון את המערכת</p>
          <p className="mt-2 text-base text-muted">
            {error || "בדקו את החיבור ונסו שוב"}
          </p>
          <button
            className="btn btn-primary mt-5"
            onClick={() => {
              setLoading(true);
              setError(null);
              refresh()
                .catch((err: Error) => setError(err.message))
                .finally(() => setLoading(false));
            }}
          >
            נסו שוב
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginView
        db={db}
        error={error}
        pending={pending}
        onLogin={(userId, password) => {
          void run(async () => {
            const next = await setSession(userId, password);
            setUser(next);
            setTab("mine");
          });
        }}
      />
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      <header className="panel animate-rise mb-5 overflow-hidden rounded-[28px]">
        <div className="relative flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div className="flex items-center gap-4">
            <Logo size={78} className="logo-float shrink-0" priority />
            <div>
              <p className="text-base font-medium text-orange">מערכת תודות צוות</p>
              <h1 className="brand-display text-3xl text-maroon sm:text-4xl">
                גן ישראל · משפחת השלוחים הצעירים
              </h1>
              <p className="mt-2 text-base font-medium leading-7 text-muted">
                שלום {user.name} · מתאמים מי מודה למי, ומעדכנים אחרי השיחה
              </p>
            </div>
          </div>
          <button
            className="btn btn-ghost self-start text-base sm:self-center"
            onClick={() => {
              void run(async () => {
                await setSession(null);
                setUser(null);
              });
            }}
          >
            החלף משתמש
          </button>
        </div>
        <nav className="flex flex-wrap gap-2 border-t border-[var(--line)] bg-white/40 p-3 sm:p-4">
          {(
            [
              ["mine", "המשימות שלי"],
              ["claim", "לוקחים תודות"],
              ["overview", "סקירה"],
              ["team", "הצוות"],
              ...(user.isAdmin ? [["admin", "ניהול"] as const] : []),
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              className={`min-w-[9rem] flex-1 rounded-2xl px-3 py-3.5 text-base transition ${
                tab === id
                  ? "bg-maroon font-medium text-[var(--paper)] shadow-md"
                  : "bg-transparent font-medium text-maroon hover:bg-orange/15"
              }`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      {error && (
        <div className="mb-4 rounded-2xl border border-maroon/20 bg-maroon/8 px-4 py-3 text-base font-medium text-maroon">
          {error}
        </div>
      )}

      {tab === "mine" && (
        <MyTasks
          db={db}
          user={user}
          pending={pending}
          onOpen={(assignment) => setActiveAssignment(assignment)}
          onAction={(action) => {
            void run(action);
          }}
        />
      )}
      {tab === "claim" && (
        <ClaimBoard
          db={db}
          user={user}
          pending={pending}
          onAction={(action) => {
            void run(action);
          }}
        />
      )}
      {tab === "overview" && <Overview db={db} />}
      {tab === "team" && <TeamDirectory db={db} />}
      {tab === "admin" && user.isAdmin && (
        <AdminPanel
          db={db}
          user={user}
          pending={pending}
          onAction={(action) => {
            void run(action);
          }}
        />
      )}

      {activeAssignment && (
        <UpdateModal
          db={db}
          assignment={activeAssignment}
          onClose={() => setActiveAssignment(null)}
          onSave={(patch) =>
            run(async () => {
              await updateAssignmentApi(activeAssignment.id, patch);
              setActiveAssignment(null);
            })
          }
        />
      )}
    </div>
  );
}

function PasswordSettings({
  pending,
  onAction,
}: {
  pending: boolean;
  onAction: (action: () => Promise<void>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="panel rounded-[28px] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="section-title text-xl text-maroon">הסיסמה שלי</h3>
          <p className="text-base font-medium text-muted">
            אפשר לעדכן את הסיסמה האישית בכל רגע
          </p>
        </div>
        <button className="btn btn-ghost" onClick={() => setOpen((v) => !v)}>
          {open ? "סגור" : "שינוי סיסמה"}
        </button>
      </div>
      {open && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <input
            className="field"
            type="password"
            placeholder="סיסמה נוכחית"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <input
            className="field"
            type="password"
            placeholder="סיסמה חדשה"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <input
            className="field"
            type="password"
            placeholder="אימות סיסמה חדשה"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <button
            className="btn btn-primary sm:col-span-3"
            disabled={pending || !currentPassword || !newPassword}
            onClick={() => {
              if (newPassword !== confirm) {
                setMessage("הסיסמאות החדשות לא תואמות");
                return;
              }
              onAction(async () => {
                await changePasswordApi({ currentPassword, newPassword });
                setCurrentPassword("");
                setNewPassword("");
                setConfirm("");
                setMessage("הסיסמה עודכנה בהצלחה");
                setOpen(false);
              });
            }}
          >
            שמירת סיסמה חדשה
          </button>
          {message && <p className="text-sm text-maroon sm:col-span-3">{message}</p>}
        </div>
      )}
    </div>
  );
}

function LoginView({
  db,
  onLogin,
  error,
  pending,
}: {
  db: DbResponse;
  onLogin: (userId: string, password: string) => void;
  error: string | null;
  pending: boolean;
}) {
  const seniorList = seniors(db);
  const [selected, setSelected] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-4 py-10">
      <div className="panel animate-rise overflow-hidden rounded-[32px]">
        <div className="relative px-6 pb-8 pt-10 text-center sm:px-10">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,rgba(245,168,58,0.35),transparent_70%)]" />
          <Logo size={180} className="logo-float relative mx-auto" priority />
          <h1 className="brand-display animate-rise-delay-1 mt-5 text-3xl text-maroon sm:text-4xl">
            קעמפ גן ישראל
          </h1>
          <p className="section-title animate-rise-delay-1 text-xl text-maroon/85">
            משפחת השלוחים הצעירים
          </p>
          <p className="animate-rise-delay-2 mx-auto mt-4 max-w-md text-base font-normal leading-7 text-muted">
            כניסה לצוות הבכיר בלבד — 11 אנשים: 4 גנרלים, 4 קצינים, חיים,
            מענדל ויעקב.
          </p>
        </div>

        <div className="space-y-4 border-t border-[var(--line)] bg-white/50 px-6 py-6 sm:px-10">
          <label className="block text-base font-medium text-maroon">
            מי אתה מהצוות הבכיר?
          </label>
          <select
            className="field"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">בחרו שם…</option>
            {seniorList.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name} · {roleName(db, person.roleId)}
              </option>
            ))}
          </select>
          <label className="block text-base font-medium text-maroon">
            סיסמה אישית
          </label>
          <input
            className="field"
            type="password"
            autoComplete="current-password"
            placeholder="הסיסמה שלך"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && selected && password) {
                onLogin(selected, password);
              }
            }}
          />
          {error && (
            <div className="rounded-2xl border border-maroon/30 bg-maroon/10 px-4 py-3 text-base font-medium text-maroon">
              {error}
            </div>
          )}
          <button
            className="btn btn-primary w-full"
            disabled={!selected || !password || pending}
            onClick={() => onLogin(selected, password)}
          >
            כניסה למערכת התודות
          </button>
        </div>
      </div>
    </div>
  );
}

function MyTasks({
  db,
  user,
  pending,
  onOpen,
  onAction,
}: {
  db: DbResponse;
  user: Person;
  pending: boolean;
  onOpen: (assignment: Assignment) => void;
  onAction: (action: () => Promise<void>) => void;
}) {
  const mine = assignmentsForAssignee(db, user.id);
  const pendingTasks = mine.filter((a) => a.status === "pending");
  const done = mine.filter((a) => a.status === "done");
  const suggestions = db.assignments.filter(
    (a) =>
      a.needsAdditionalThanks &&
      a.status === "done" &&
      a.additionalThankerIds?.includes(user.id),
  );
  const incomingRequests = (db.claimRequests ?? []).filter(
    (r) => r.status === "pending" && r.targetAssigneeId === user.id,
  );
  const outgoingRequests = (db.claimRequests ?? []).filter(
    (r) => r.status === "pending" && r.requesterId === user.id,
  );

  async function movePriority(assignmentId: string, direction: -1 | 1) {
    const ordered = mine.map((a) => a.id);
    const index = ordered.indexOf(assignmentId);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= ordered.length) return;
    const swapped = [...ordered];
    [swapped[index], swapped[next]] = [swapped[next], swapped[index]];
    await reorderAssignmentsApi(swapped);
  }

  return (
    <section className="animate-rise space-y-5">
      <PasswordSettings pending={pending} onAction={onAction} />

      <div className="panel rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="section-title text-3xl text-maroon">
              המשימות שלי
            </h2>
            <p className="mt-1 text-base font-medium text-muted">
              {pendingTasks.length} ממתינות · {done.length} בוצעו · סדרו לפי
              עדיפות
            </p>
          </div>
          <div className="min-w-[180px] flex-1 sm:max-w-xs">
            <div className="mb-1 flex justify-between text-base text-muted">
              <span>התקדמות</span>
              <span>{percent(done.length, mine.length)}%</span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${percent(done.length, mine.length)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {incomingRequests.length > 0 && (
        <div className="rounded-[24px] border border-maroon/20 bg-maroon/5 p-4">
          <h3 className="font-semibold text-maroon">בקשות להצטרף לתודות שלי</h3>
          <ul className="mt-3 space-y-3">
            {incomingRequests.map((request) => {
              const recipient = personById(db, request.recipientId);
              const requester = personById(db, request.requesterId);
              return (
                <li
                  key={request.id}
                  className="rounded-2xl bg-white/80 px-3 py-3 text-sm"
                >
                  <p>
                    <strong>{requester?.name}</strong> מבקש גם להודות ל־
                    <strong>{recipient?.name}</strong>
                  </p>
                  {request.note && (
                    <p className="mt-1 text-muted">{request.note}</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className="btn btn-secondary !px-3 !py-2.5 text-sm"
                      disabled={pending}
                      onClick={() =>
                        onAction(async () => {
                          await respondClaimRequestApi({
                            requestId: request.id,
                            approve: true,
                          });
                        })
                      }
                    >
                      אישור
                    </button>
                    <button
                      className="btn btn-ghost !px-3 !py-2.5 text-sm"
                      disabled={pending}
                      onClick={() =>
                        onAction(async () => {
                          await respondClaimRequestApi({
                            requestId: request.id,
                            approve: false,
                          });
                        })
                      }
                    >
                      דחייה
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {outgoingRequests.length > 0 && (
        <div className="rounded-[24px] border border-orange/40 bg-orange/10 p-4">
          <h3 className="font-semibold text-maroon">הבקשות ששלחתי</h3>
          <ul className="mt-3 space-y-2">
            {outgoingRequests.map((request) => {
              const recipient = personById(db, request.recipientId);
              const target = personById(db, request.targetAssigneeId);
              return (
                <li
                  key={request.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/70 px-3 py-3 text-sm"
                >
                  <span>
                    בקשה על <strong>{recipient?.name}</strong> אצל {target?.name}
                  </span>
                  <button
                    className="underline text-maroon"
                    disabled={pending}
                    onClick={() =>
                      onAction(async () => {
                        await respondClaimRequestApi({
                          requestId: request.id,
                          approve: false,
                        });
                      })
                    }
                  >
                    ביטול בקשה
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="rounded-[24px] border border-orange/40 bg-orange/10 p-4">
          <h3 className="font-semibold text-maroon">הומלץ שגם תודה</h3>
          <ul className="mt-3 space-y-2">
            {suggestions.map((a) => {
              const recipient = personById(db, a.recipientId);
              const from = personById(db, a.assigneeId);
              return (
                <li
                  key={a.id}
                  className="rounded-2xl bg-white/70 px-3 py-3 text-sm"
                >
                  <strong>{recipient?.name}</strong>
                  <span className="text-muted">
                    {" "}
                    · הומלץ ע״י {from?.name}
                    {a.additionalThankerNote
                      ? ` · ${a.additionalThankerNote}`
                      : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {mine.length === 0 ? (
        <EmptyState text="עדיין אין לך משימות. עברו לטאב ״לוקחים תודות״ ובחרו למי להודות." />
      ) : (
        <div className="space-y-3">
          {mine.map((assignment, index) => {
            const recipient = personById(db, assignment.recipientId);
            if (!recipient) return null;
            return (
              <article
                key={assignment.id}
                className="panel rounded-[24px] p-4 transition hover:-translate-y-0.5 sm:p-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="chip chip-warn">
                        עדיפות {assignment.priority ?? index + 1}
                      </span>
                      <h3 className="text-xl font-medium text-ink">
                        {recipient.name}
                      </h3>
                      <span
                        className={`chip ${
                          assignment.status === "done"
                            ? "chip-done"
                            : "chip-pending"
                        }`}
                      >
                        {assignment.status === "done" ? "בוצע" : "ממתין"}
                      </span>
                    </div>
                    <p className="mt-1 text-base text-muted">
                      {roleName(db, recipient.roleId)}
                      {recipient.phone ? ` · ${recipient.phone}` : ""}
                    </p>
                    {assignment.status === "done" && (
                      <p className="mt-2 text-base font-normal leading-6 text-ink/80">
                        {contactLabel(assignment.contactMethod)}
                        {assignment.feedback
                          ? ` · ${assignment.feedback}`
                          : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="btn btn-ghost !px-3 !py-2.5 text-sm"
                      disabled={pending || index === 0}
                      onClick={() =>
                        onAction(async () => {
                          await movePriority(assignment.id, -1);
                        })
                      }
                    >
                      למעלה
                    </button>
                    <button
                      className="btn btn-ghost !px-3 !py-2.5 text-sm"
                      disabled={pending || index === mine.length - 1}
                      onClick={() =>
                        onAction(async () => {
                          await movePriority(assignment.id, 1);
                        })
                      }
                    >
                      למטה
                    </button>
                    {assignment.status === "pending" && (
                      <button
                        className="btn btn-ghost !px-3 !py-2.5 text-sm"
                        disabled={pending}
                        onClick={() =>
                          onAction(async () => {
                            await releaseAssignmentApi(assignment.id);
                          })
                        }
                      >
                        שחרור
                      </button>
                    )}
                    <button
                      className="btn btn-secondary"
                      onClick={() => onOpen(assignment)}
                    >
                      {assignment.status === "done"
                        ? "עדכון פרטים"
                        : "עדכון אחרי תודה"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Overview({ db }: { db: DbResponse }) {
  const { stats } = db;
  const completion = percent(stats.completedRecipients, stats.totalRecipients);
  const seniorStats = seniors(db).map((senior) => {
    const items = assignmentsForAssignee(db, senior.id);
    const done = items.filter((a) => a.status === "done").length;
    return { senior, total: items.length, done, pending: items.length - done };
  });

  const needsMore = db.assignments.filter(
    (a) => a.needsAdditionalThanks && a.status === "done",
  );

  return (
    <section className="animate-rise space-y-5">
      <div className="panel rounded-[28px] p-5 sm:p-6">
        <h2 className="brand-display text-2xl font-bold text-maroon">
          סקירת התקדמות
        </h2>
        <p className="mt-1 text-base text-muted">
          כמה מהצוות כבר קיבלו תודה, ומה עוד פתוח
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="אנשי צוות להודות" value={stats.totalRecipients} />
          <Stat label="כבר שויכו" value={stats.assignedRecipients} />
          <Stat label="קיבלו תודה" value={stats.completedRecipients} />
          <Stat label="ללא שיוך" value={stats.unassignedRecipients} />
        </div>
        <div className="mt-5">
          <div className="mb-1 flex justify-between text-sm">
            <span>השלמת תודות</span>
            <span className="font-semibold text-maroon">{completion}%</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${completion}%` }} />
          </div>
        </div>
      </div>

      <div className="panel rounded-[28px] p-5 sm:p-6">
        <h3 className="text-xl font-medium text-maroon">עומס לפי איש צוות בכיר</h3>
        <div className="mt-4 space-y-3">
          {seniorStats.map(({ senior, total, done, pending }) => (
            <div
              key={senior.id}
              className="rounded-2xl border border-[var(--line)] bg-white/55 px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{senior.name}</p>
                  <p className="text-base text-muted">
                    {roleName(db, senior.roleId)}
                  </p>
                </div>
                <p className="text-base text-muted">
                  {done}/{total} בוצעו · {pending} ממתינים
                </p>
              </div>
              <div className="progress-track mt-2">
                <div
                  className="progress-fill"
                  style={{ width: `${percent(done, total)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {needsMore.length > 0 && (
        <div className="panel rounded-[28px] p-5 sm:p-6">
          <h3 className="text-xl font-medium text-maroon">
            מומלץ שמישהו נוסף יודה
          </h3>
          <ul className="mt-3 space-y-2">
            {needsMore.map((a) => {
              const recipient = personById(db, a.recipientId);
              const from = personById(db, a.assigneeId);
              const names =
                a.additionalThankerIds
                  ?.map((id) => personById(db, id)?.name)
                  .filter(Boolean)
                  .join(", ") || "לא צוין מי";
              return (
                <li
                  key={a.id}
                  className="rounded-2xl bg-orange/10 px-4 py-3 text-sm"
                >
                  <strong>{recipient?.name}</strong> — לפי {from?.name}: {names}
                  {a.additionalThankerNote
                    ? ` · ${a.additionalThankerNote}`
                    : ""}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white/60 px-4 py-4">
      <p className="text-3xl font-bold text-maroon">{value}</p>
      <p className="mt-1 text-base text-muted">{label}</p>
    </div>
  );
}

function TeamDirectory({ db }: { db: DbResponse }) {
  const roles = sortedRoles(db);
  return (
    <section className="animate-rise space-y-4">
      <div className="panel rounded-[28px] p-5 sm:p-6">
        <h2 className="brand-display text-2xl font-bold text-maroon">
          מדריך הצוות
        </h2>
        <p className="mt-1 text-base text-muted">
          כל אנשי הצוות לפי תפקידים, עם סטטוס תודה
        </p>
      </div>
      {roles.map((role) => {
        const people = db.people
          .filter((p) => p.roleId === role.id)
          .sort((a, b) => a.name.localeCompare(b.name, "he"));
        if (people.length === 0) return null;
        return (
          <div key={role.id} className="panel rounded-[28px] p-5">
            <h3 className="text-xl font-medium text-maroon">{role.name}</h3>
            <ul className="mt-3 divide-y divide-[var(--line)]">
              {people.map((person) => {
                const coverage = recipientCoverage(db, person.id);
                return (
                  <li
                    key={person.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3"
                  >
                    <div>
                      <p className="font-semibold">
                        {person.name}
                        {person.isSenior ? " · בכיר" : ""}
                      </p>
                      {person.phone && (
                        <p className="text-base text-muted">{person.phone}</p>
                      )}
                    </div>
                    <span
                      className={`chip ${
                        coverage.hasDone
                          ? "chip-done"
                          : coverage.hasAny
                            ? "chip-pending"
                            : "chip-warn"
                      }`}
                    >
                      {coverage.hasDone
                        ? "קיבל תודה"
                        : coverage.hasAny
                          ? "משויך"
                          : "ללא שיוך"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function AdminPanel({
  db,
  user,
  pending,
  onAction,
}: {
  db: DbResponse;
  user: Person;
  pending: boolean;
  onAction: (action: () => Promise<void>) => void;
}) {
  const [roleNameInput, setRoleNameInput] = useState("");
  const [personName, setPersonName] = useState("");
  const [personRoleId, setPersonRoleId] = useState(db.roles[0]?.id ?? "");
  const [personSenior, setPersonSenior] = useState(false);
  const [assigneeId, setAssigneeId] = useState(user.id);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [filterRole, setFilterRole] = useState("all");
  const [logoMessage, setLogoMessage] = useState<string | null>(null);
  const [passwordRows, setPasswordRows] = useState<SeniorPasswordInfo[]>([]);
  const [resetDrafts, setResetDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    void fetchSeniorPasswordsApi()
      .then(setPasswordRows)
      .catch(() => setPasswordRows([]));
  }, [db.updatedAt]);

  const unassigned = useMemo(() => {
    const assigned = new Set(db.assignments.map((a) => a.recipientId));
    return thankablePeople(db).filter((p) => {
      if (p.id === assigneeId) return false;
      if (assigned.has(p.id)) return false;
      if (filterRole !== "all" && p.roleId !== filterRole) return false;
      return true;
    });
  }, [db, filterRole, assigneeId]);

  function toggleRecipient(id: string) {
    setSelectedRecipients((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <section className="animate-rise space-y-5">
      <div className="panel rounded-[28px] p-5 sm:p-6">
        <h2 className="brand-display text-2xl font-bold text-maroon">ניהול</h2>
        <p className="mt-1 text-base text-muted">
          צוות בכיר: 11 אנשים בלבד · סיסמאות, לוגו, שיוכים וניהול רשימות
        </p>
      </div>

      <div className="panel rounded-[28px] p-5 sm:p-6">
        <h3 className="text-xl font-medium text-maroon">סיסמאות הצוות הבכיר</h3>
        <p className="mt-1 text-base text-muted">
          סיסמאות התחלתיות מוצגות רק למי שעדיין לא החליף. אפשר לאפס לכל אחד.
        </p>
        <div className="mt-4 space-y-3">
          {passwordRows.map((row) => (
            <div
              key={row.id}
              className="rounded-2xl border border-[var(--line)] bg-white/60 px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{row.name}</p>
                  <p className="text-base text-muted">
                    {row.usesDefaultPassword
                      ? `סיסמה התחלתית: ${row.defaultPassword}`
                      : "החליף סיסמה אישית"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="field !w-40"
                    type="text"
                    placeholder="סיסמה חדשה"
                    value={resetDrafts[row.id] ?? ""}
                    onChange={(e) =>
                      setResetDrafts((prev) => ({
                        ...prev,
                        [row.id]: e.target.value,
                      }))
                    }
                  />
                  <button
                    className="btn btn-ghost !px-3 !py-2.5 text-sm"
                    disabled={pending || !(resetDrafts[row.id] ?? "").trim()}
                    onClick={() =>
                      onAction(async () => {
                        await resetPasswordApi({
                          personId: row.id,
                          newPassword: resetDrafts[row.id],
                        });
                        setResetDrafts((prev) => ({ ...prev, [row.id]: "" }));
                        setPasswordRows(await fetchSeniorPasswordsApi());
                      })
                    }
                  >
                    איפוס
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel rounded-[28px] p-5 sm:p-6">
        <h3 className="text-xl font-medium text-maroon">החלפת לוגו</h3>
        <p className="mt-1 text-base text-muted">
          בחרו את קובץ הלוגו מהטלפון או מהמחשב (PNG / JPG / WEBP)
        </p>
        <div className="mt-4 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <Logo size={96} />
          <label className="btn btn-secondary cursor-pointer">
            בחירת קובץ לוגו
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              disabled={pending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                onAction(async () => {
                  setLogoMessage(null);
                  const meta = await uploadLogoApi(file);
                  window.dispatchEvent(
                    new CustomEvent("logo-updated", { detail: meta }),
                  );
                  setLogoMessage("הלוגו עודכן בהצלחה");
                });
              }}
            />
          </label>
        </div>
        {logoMessage && (
          <p className="mt-3 text-base font-medium text-pine">{logoMessage}</p>
        )}
      </div>

      <div className="panel rounded-[28px] p-5 sm:p-6">
        <h3 className="text-xl font-medium text-maroon">חלוקת תודות</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">מי מודה</span>
            <select
              className="field"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
            >
              {seniors(db).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">סינון תפקיד ללא שיוך</span>
            <select
              className="field"
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
            >
              <option value="all">כל התפקידים</option>
              {sortedRoles(db).map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-[var(--line)] bg-white/50 p-3">
          {unassigned.length === 0 ? (
            <p className="text-base text-muted">אין אנשים לא משויכים בסינון הזה</p>
          ) : (
            unassigned.map((person) => (
              <label
                key={person.id}
                className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 hover:bg-orange/10"
              >
                <input
                  type="checkbox"
                  checked={selectedRecipients.includes(person.id)}
                  onChange={() => toggleRecipient(person.id)}
                />
                <span>
                  {person.name}
                  <span className="text-muted">
                    {" "}
                    · {roleName(db, person.roleId)}
                  </span>
                </span>
              </label>
            ))
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="btn btn-primary"
            disabled={pending || selectedRecipients.length === 0}
            onClick={() =>
              onAction(async () => {
                await createAssignmentsBulkApi({
                  assigneeId,
                  recipientIds: selectedRecipients,
                });
                setSelectedRecipients([]);
              })
            }
          >
            שייך נבחרים ({selectedRecipients.length})
          </button>
          <button
            className="btn btn-secondary"
            disabled={pending}
            onClick={() =>
              onAction(async () => {
                await autoDistributeApi();
              })
            }
          >
            חלוקה אוטומטית לכל הלא-משויכים
          </button>
          <button
            className="btn btn-ghost"
            disabled={pending || unassigned.length === 0}
            onClick={() => setSelectedRecipients(unassigned.map((p) => p.id))}
          >
            בחר הכל בסינון
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="panel rounded-[28px] p-5">
          <h3 className="text-xl font-medium text-maroon">הוספת תפקיד</h3>
          <div className="mt-3 flex gap-2">
            <input
              className="field"
              placeholder="שם תפקיד חדש"
              value={roleNameInput}
              onChange={(e) => setRoleNameInput(e.target.value)}
            />
            <button
              className="btn btn-primary shrink-0"
              disabled={pending || !roleNameInput.trim()}
              onClick={() =>
                onAction(async () => {
                  await createRole(roleNameInput);
                  setRoleNameInput("");
                })
              }
            >
              הוסף
            </button>
          </div>
          <ul className="mt-4 space-y-2">
            {sortedRoles(db).map((role) => (
              <li
                key={role.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-white/55 px-3 py-2 text-sm"
              >
                <span>{role.name}</span>
                <button
                  className="text-maroon underline disabled:opacity-40"
                  disabled={pending}
                  onClick={() =>
                    onAction(async () => {
                      await deleteRoleApi(role.id);
                    })
                  }
                >
                  מחק
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel rounded-[28px] p-5">
          <h3 className="text-xl font-medium text-maroon">הוספת אדם</h3>
          <div className="mt-3 space-y-3">
            <input
              className="field"
              placeholder="שם מלא"
              value={personName}
              onChange={(e) => setPersonName(e.target.value)}
            />
            <select
              className="field"
              value={personRoleId}
              onChange={(e) => setPersonRoleId(e.target.value)}
            >
              {sortedRoles(db).map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={personSenior}
                onChange={(e) => setPersonSenior(e.target.checked)}
              />
              חלק מהצוות הבכיר (יכול להיכנס ולנהל תודות)
            </label>
            <button
              className="btn btn-primary"
              disabled={pending || !personName.trim() || !personRoleId}
              onClick={() =>
                onAction(async () => {
                  await createPerson({
                    name: personName,
                    roleId: personRoleId,
                    isSenior: personSenior,
                  });
                  setPersonName("");
                  setPersonSenior(false);
                })
              }
            >
              הוסף אדם
            </button>
          </div>
        </div>
      </div>

      <div className="panel rounded-[28px] p-5 sm:p-6">
        <h3 className="text-xl font-medium text-maroon">אנשים ושיוכים</h3>
        <div className="mt-4 space-y-3">
          {db.people
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name, "he"))
            .map((person) => (
              <div
                key={person.id}
                className="rounded-2xl border border-[var(--line)] bg-white/55 px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      {person.name}
                      {person.isSenior ? " · בכיר" : ""}
                    </p>
                    <p className="text-base text-muted">
                      {roleName(db, person.roleId)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="btn btn-ghost !px-3 !py-2.5 text-sm"
                      disabled={pending}
                      onClick={() =>
                        onAction(async () => {
                          await updatePersonApi(person.id, {
                            isSenior: !person.isSenior,
                          });
                        })
                      }
                    >
                      {person.isSenior ? "הסר מבכירים" : "סמן כבכיר"}
                    </button>
                    <button
                      className="btn btn-ghost !px-3 !py-2.5 text-sm"
                      disabled={pending}
                      onClick={() =>
                        onAction(async () => {
                          if (
                            confirm(`למחוק את ${person.name}? פעולה זו תסיר גם שיוכים.`)
                          ) {
                            await deletePersonApi(person.id);
                          }
                        })
                      }
                    >
                      מחק
                    </button>
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>

      <div className="panel rounded-[28px] p-5 sm:p-6">
        <h3 className="text-xl font-medium text-maroon">כל השיוכים</h3>
        <div className="mt-3 space-y-2">
          {db.assignments.length === 0 ? (
            <p className="text-base text-muted">עדיין אין שיוכים</p>
          ) : (
            db.assignments.map((assignment) => {
              const assignee = personById(db, assignment.assigneeId);
              const recipient = personById(db, assignment.recipientId);
              return (
                <div
                  key={assignment.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/55 px-3 py-3 text-sm"
                >
                  <span>
                    <strong>{assignee?.name}</strong> → {recipient?.name}{" "}
                    <span
                      className={`chip ${
                        assignment.status === "done"
                          ? "chip-done"
                          : "chip-pending"
                      }`}
                    >
                      {assignment.status === "done" ? "בוצע" : "ממתין"}
                    </span>
                  </span>
                  <div className="flex gap-2">
                    {assignment.status === "pending" &&
                      assignment.assigneeId !== user.id && (
                      <button
                        className="underline text-maroon"
                        disabled={pending}
                        onClick={() =>
                          onAction(async () => {
                            await updateAssignmentApi(assignment.id, {
                              assigneeId: user.id,
                            });
                          })
                        }
                      >
                        העבר אליי
                      </button>
                    )}
                    <button
                      className="underline text-maroon"
                      disabled={pending}
                      onClick={() =>
                        onAction(async () => {
                          await deleteAssignmentApi(assignment.id);
                        })
                      }
                    >
                      מחק שיוך
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="rounded-[24px] border border-maroon/20 bg-maroon/5 p-5">
        <h3 className="font-bold text-maroon">איפוס נתונים</h3>
        <p className="mt-1 text-base text-muted">
          מחזיר את רשימות הצוות והתפקידים למצב ההתחלתי ומוחק שיוכים ועדכונים.
        </p>
        <button
          className="btn btn-ghost mt-3"
          disabled={pending}
          onClick={() =>
            onAction(async () => {
              if (confirm("לאפס את כל הנתונים?")) {
                await resetDbApi();
              }
            })
          }
        >
          איפוס למצב התחלתי
        </button>
      </div>
    </section>
  );
}

function UpdateModal({
  db,
  assignment,
  onClose,
  onSave,
}: {
  db: DbResponse;
  assignment: Assignment;
  onClose: () => void;
  onSave: (patch: {
    status: "pending" | "done";
    contactMethod: ContactMethod | null;
    feedback: string;
    needsAdditionalThanks: boolean;
    additionalThankerIds: string[];
    additionalThankerNote: string;
  }) => void;
}) {
  const recipient = personById(db, assignment.recipientId);
  const [contactMethod, setContactMethod] = useState<ContactMethod | "">(
    assignment.contactMethod ?? "",
  );
  const [feedback, setFeedback] = useState(assignment.feedback ?? "");
  const [needsMore, setNeedsMore] = useState(
    Boolean(assignment.needsAdditionalThanks),
  );
  const [thankerIds, setThankerIds] = useState<string[]>(
    assignment.additionalThankerIds ?? [],
  );
  const [note, setNote] = useState(assignment.additionalThankerNote ?? "");
  const [markDone, setMarkDone] = useState(true);

  function toggleThanker(id: string) {
    setThankerIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-3 sm:items-center">
      <div className="panel max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[28px] p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="brand-display text-2xl font-bold text-maroon">
              עדכון תודה
            </h3>
            <p className="mt-1 text-base text-muted">
              {recipient?.name} · {recipient ? roleName(db, recipient.roleId) : ""}
            </p>
          </div>
          <button className="btn btn-ghost !px-3 !py-2" onClick={onClose}>
            סגור
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <p className="mb-2 text-base font-medium">איך יצרת קשר?</p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["phone", "שיחת טלפון"],
                  ["sms", "סמס"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  className={`rounded-2xl border px-3 py-3 text-base font-medium ${
                    contactMethod === value
                      ? "border-maroon bg-maroon text-[var(--paper)]"
                      : "border-[var(--line)] bg-white/70"
                  }`}
                  onClick={() => setContactMethod(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block font-semibold">
              איך הייתה התגובה? משוב קצר
            </span>
            <textarea
              className="field min-h-28"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="למשל: שמח מאוד, דיברנו על הקעמפ, ביקש למסור ד״ש…"
            />
          </label>

          <label className="flex items-center gap-2 text-base font-medium">
            <input
              type="checkbox"
              checked={needsMore}
              onChange={(e) => setNeedsMore(e.target.checked)}
            />
            כדאי שמישהו נוסף יודה לו גם
          </label>

          {needsMore && (
            <div className="space-y-3 rounded-2xl border border-[var(--line)] bg-white/60 p-3">
              <p className="text-base font-medium">מי עוד כדאי שיודה?</p>
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {seniors(db)
                  .filter((p) => p.id !== assignment.assigneeId)
                  .map((person) => (
                    <label
                      key={person.id}
                      className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-orange/10"
                    >
                      <input
                        type="checkbox"
                        checked={thankerIds.includes(person.id)}
                        onChange={() => toggleThanker(person.id)}
                      />
                      {person.name}
                    </label>
                  ))}
              </div>
              <input
                className="field"
                placeholder="הערה קצרה (אופציונלי)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          )}

          <label className="flex items-center gap-2 text-base font-medium">
            <input
              type="checkbox"
              checked={markDone}
              onChange={(e) => setMarkDone(e.target.checked)}
            />
            סמן כבוצע
          </label>

          <button
            className="btn btn-primary w-full"
            onClick={() =>
              onSave({
                status: markDone ? "done" : "pending",
                contactMethod: contactMethod || null,
                feedback,
                needsAdditionalThanks: needsMore,
                additionalThankerIds: thankerIds,
                additionalThankerNote: note,
              })
            }
          >
            שמירת עדכון
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="panel rounded-[28px] p-8 text-center text-muted">{text}</div>
  );
}
