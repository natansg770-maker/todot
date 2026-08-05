"use client";

import { useEffect, useRef, useState } from "react";
import { fetchLive, postHeartbeat, type LiveSnapshot } from "@/lib/api";
import type { ActivityEvent, Person } from "@/lib/types";

type ToastItem = ActivityEvent & { toastId: string };

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("he-IL", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function typeLabel(type: ActivityEvent["type"]) {
  switch (type) {
    case "login":
      return "התחברות";
    case "claim":
      return "לקיחה";
    case "release":
      return "שחרור";
    case "done":
      return "בוצע";
    case "delete":
      return "מחיקה";
    case "join_request":
      return "בקשה";
    case "join_approved":
      return "אושר";
    case "join_rejected":
      return "נדחה";
    default:
      return "עדכון";
  }
}

export function LiveLayer({
  user,
  onDbRefresh,
}: {
  user: Person;
  onDbRefresh: () => void;
}) {
  const [live, setLive] = useState<LiveSnapshot | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [boardOpen, setBoardOpen] = useState(true);
  const seenIds = useRef<Set<string>>(new Set());
  const bootstrapped = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function pull(kind: "poll" | "heartbeat") {
      try {
        const snapshot =
          kind === "heartbeat" ? await postHeartbeat() : await fetchLive();
        if (cancelled) return;

        if (!bootstrapped.current) {
          seenIds.current = new Set(snapshot.activity.map((e) => e.id));
          bootstrapped.current = true;
        } else {
          const fresh = snapshot.activity.filter(
            (event) => !seenIds.current.has(event.id),
          );
          if (fresh.length > 0) {
            for (const event of fresh) seenIds.current.add(event.id);
            const toastable = fresh.filter(
              (event) => event.actorId !== user.id || event.type === "done",
            );
            if (toastable.length > 0) {
              setToasts((prev) => [
                ...toastable.map((event) => ({
                  ...event,
                  toastId: `${event.id}-${Date.now()}`,
                })),
                ...prev,
              ].slice(0, 5));
            }
            // Refresh main DB when others change assignments.
            if (fresh.some((e) => e.actorId !== user.id && e.type !== "login")) {
              onDbRefresh();
            }
          }
        }
        setLive(snapshot);
      } catch {
        // ignore transient live errors
      }
    }

    void pull("heartbeat");
    const pollTimer = window.setInterval(() => void pull("poll"), 4000);
    const beatTimer = window.setInterval(() => void pull("heartbeat"), 12000);

    return () => {
      cancelled = true;
      window.clearInterval(pollTimer);
      window.clearInterval(beatTimer);
    };
  }, [user.id, onDbRefresh]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = window.setTimeout(() => {
      setToasts((prev) => prev.slice(0, -1));
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [toasts]);

  const onlineCount = live?.onlineCount ?? 0;
  const activity = live?.activity ?? [];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="online-pill">
          <span className="online-dot" aria-hidden />
          <span className="font-medium">
            {onlineCount === 0
              ? "אין מחוברים כרגע"
              : onlineCount === 1
                ? "מחובר אחד למערכת"
                : `${onlineCount} מחוברים למערכת`}
          </span>
          {live && live.online.length > 0 && (
            <span className="text-muted">
              · {live.online.map((p) => p.name.split(" ").slice(-1)[0] || p.name).join(", ")}
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn btn-ghost !py-2 text-sm"
          onClick={() => setBoardOpen((v) => !v)}
        >
          {boardOpen ? "הסתר לוח עדכונים" : "הצג לוח עדכונים"}
        </button>
      </div>

      {boardOpen && (
        <section className="panel animate-rise mb-5 rounded-[28px] p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="section-title text-xl text-maroon">לוח עדכונים</h2>
            <span className="chip chip-pending">בשידור חי</span>
          </div>
          {activity.length === 0 ? (
            <p className="text-base text-muted">
              עדיין אין עדכונים — ברגע שמישהו לוקח או מסיים תודה, זה יופיע כאן.
            </p>
          ) : (
            <ul className="activity-list">
              {activity.slice(0, 12).map((event) => (
                <li key={event.id} className="activity-row">
                  <span className={`activity-tag tag-${event.type}`}>
                    {typeLabel(event.type)}
                  </span>
                  <span className="activity-msg">{event.message}</span>
                  <span className="activity-time">{formatTime(event.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.toastId} className="live-toast">
            <div className="flex items-center justify-between gap-3">
              <span className={`activity-tag tag-${toast.type}`}>
                {typeLabel(toast.type)}
              </span>
              <span className="text-sm text-muted">{formatTime(toast.createdAt)}</span>
            </div>
            <p className="mt-1 text-base font-medium text-ink">{toast.message}</p>
          </div>
        ))}
      </div>
    </>
  );
}
