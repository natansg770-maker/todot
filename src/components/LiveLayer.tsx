"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  fetchLive,
  postHeartbeat,
  sendChatMessageApi,
  type LiveSnapshot,
} from "@/lib/api";
import type { ActivityEvent, Person } from "@/lib/types";

const ACTIVITY_READ_KEY = "todot-activity-read-at";
const CHAT_READ_KEY = "todot-chat-read-at";

type ToastItem = ActivityEvent & { toastId: string };
type Panel = "none" | "updates" | "chat";

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

function readStamp(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeStamp(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function countUnreadActivity(
  activity: ActivityEvent[],
  userId: string,
  readAt: string,
) {
  if (!readAt) {
    return activity.filter((e) => e.actorId !== userId).length;
  }
  const stamp = new Date(readAt).getTime();
  return activity.filter(
    (e) => e.actorId !== userId && new Date(e.createdAt).getTime() > stamp,
  ).length;
}

function countUnreadChat(
  chat: LiveSnapshot["chat"],
  userId: string,
  readAt: string,
) {
  if (!chat?.length) return 0;
  if (!readAt) {
    return chat.filter((m) => m.senderId !== userId).length;
  }
  const stamp = new Date(readAt).getTime();
  return chat.filter(
    (m) => m.senderId !== userId && new Date(m.createdAt).getTime() > stamp,
  ).length;
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
  const [panel, setPanel] = useState<Panel>("none");
  const [chatText, setChatText] = useState("");
  const [chatPending, setChatPending] = useState(false);
  const [activityReadAt, setActivityReadAt] = useState("");
  const [chatReadAt, setChatReadAt] = useState("");
  const seenIds = useRef<Set<string>>(new Set());
  const bootstrapped = useRef(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setActivityReadAt(readStamp(ACTIVITY_READ_KEY));
    setChatReadAt(readStamp(CHAT_READ_KEY));
  }, []);

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
          // First visit: don't mark historical noise as unread.
          if (!readStamp(ACTIVITY_READ_KEY) && snapshot.serverTime) {
            writeStamp(ACTIVITY_READ_KEY, snapshot.serverTime);
            setActivityReadAt(snapshot.serverTime);
          }
          if (!readStamp(CHAT_READ_KEY) && snapshot.serverTime) {
            writeStamp(CHAT_READ_KEY, snapshot.serverTime);
            setChatReadAt(snapshot.serverTime);
          }
        } else {
          const fresh = snapshot.activity.filter(
            (event) => !seenIds.current.has(event.id),
          );
          if (fresh.length > 0) {
            for (const event of fresh) seenIds.current.add(event.id);
            const toastable = fresh.filter((event) => event.actorId !== user.id);
            if (toastable.length > 0) {
              setToasts((prev) =>
                [
                  ...toastable.map((event) => ({
                    ...event,
                    toastId: `${event.id}-${Date.now()}`,
                  })),
                  ...prev,
                ].slice(0, 4),
              );
            }
            if (fresh.some((e) => e.actorId !== user.id)) {
              onDbRefresh();
            }
          }
        }
        setLive({
          ...snapshot,
          chat: snapshot.chat ?? [],
        });
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
    }, 4200);
    return () => window.clearTimeout(timer);
  }, [toasts]);

  useEffect(() => {
    if (panel === "chat") {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [panel, live?.chat?.length]);

  function openUpdates() {
    setPanel("updates");
    const now = new Date().toISOString();
    writeStamp(ACTIVITY_READ_KEY, now);
    setActivityReadAt(now);
  }

  function openChat() {
    setPanel("chat");
    const now = new Date().toISOString();
    writeStamp(CHAT_READ_KEY, now);
    setChatReadAt(now);
  }

  async function sendChat() {
    const text = chatText.trim();
    if (!text || chatPending) return;
    setChatPending(true);
    try {
      const snapshot = await sendChatMessageApi(text);
      setLive({ ...snapshot, chat: snapshot.chat ?? [] });
      setChatText("");
      const now = new Date().toISOString();
      writeStamp(CHAT_READ_KEY, now);
      setChatReadAt(now);
    } catch {
      // surfaced by empty send / network — keep text
    } finally {
      setChatPending(false);
    }
  }

  const activity = live?.activity ?? [];
  const chat = live?.chat ?? [];
  const onlineCount = live?.onlineCount ?? 0;
  const unreadActivity = countUnreadActivity(activity, user.id, activityReadAt);
  const unreadChat = countUnreadChat(chat, user.id, chatReadAt);

  return (
    <>
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

      {(panel === "updates" || panel === "chat") && (
        <button
          type="button"
          className="float-scrim"
          aria-label="סגירת חלון"
          onClick={() => setPanel("none")}
        />
      )}

      {panel === "updates" && (
        <div className="float-panel" role="dialog" aria-label="לוח עדכונים">
          <div className="float-panel-head">
            <div>
              <h2 className="section-title text-xl text-maroon">לוח עדכונים</h2>
              <p className="mt-1 text-sm text-muted">
                {onlineCount === 0
                  ? "אין מחוברים כרגע"
                  : `${onlineCount} מחוברים · ${live?.online.map((p) => p.name).join(", ")}`}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost !px-3 !py-2 text-sm"
              onClick={() => setPanel("none")}
            >
              סגור
            </button>
          </div>
          <div className="float-panel-body">
            {activity.length === 0 ? (
              <p className="text-base text-muted">
                עדיין אין עדכונים אמיתיים. כשמישהו לוקח / משחרר / מסיים תודה —
                זה יופיע כאן.
              </p>
            ) : (
              <ul className="activity-list stagger-in">
                {activity.slice(0, 20).map((event) => (
                  <li key={event.id} className="activity-row">
                    <span className={`activity-tag tag-${event.type}`}>
                      {typeLabel(event.type)}
                    </span>
                    <span className="activity-msg">{event.message}</span>
                    <span className="activity-time">
                      {formatTime(event.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {panel === "chat" && (
        <div className="float-panel" role="dialog" aria-label="צ׳אט צוות">
          <div className="float-panel-head">
            <div>
              <h2 className="section-title text-xl text-maroon">צ׳אט צוות</h2>
              <p className="mt-1 text-sm text-muted">
                שיחה פנימית בין הצוות הבכיר
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost !px-3 !py-2 text-sm"
              onClick={() => setPanel("none")}
            >
              סגור
            </button>
          </div>
          <div className="float-panel-body chat-body">
            {chat.length === 0 ? (
              <p className="text-base text-muted">
                עוד אין הודעות. כתבו משהו לצוות 🙂
              </p>
            ) : (
              chat.map((message) => {
                const mine = message.senderId === user.id;
                return (
                  <div
                    key={message.id}
                    className={`chat-bubble ${mine ? "mine" : "theirs"}`}
                  >
                    {!mine && (
                      <p className="chat-name">{message.senderName}</p>
                    )}
                    <p className="chat-text">{message.text}</p>
                    <p className="chat-time">{formatTime(message.createdAt)}</p>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="chat-compose">
            <input
              className="field"
              placeholder="כתבו הודעה לצוות…"
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void sendChat();
                }
              }}
            />
            <button
              type="button"
              className="btn btn-primary !px-4"
              disabled={chatPending || !chatText.trim()}
              onClick={() => void sendChat()}
            >
              שלח
            </button>
          </div>
        </div>
      )}

      <div className="float-fabs">
        <button
          type="button"
          className="fab fab-updates"
          aria-label="לוח עדכונים"
          onClick={() => {
            if (panel === "updates") setPanel("none");
            else openUpdates();
          }}
        >
          <span className="fab-icon" aria-hidden>
            !
          </span>
          {unreadActivity > 0 && (
            <span key={`a-${unreadActivity}`} className="fab-badge badge-pop">
              {unreadActivity > 99 ? "99+" : unreadActivity}
            </span>
          )}
        </button>

        <button
          type="button"
          className="fab fab-chat"
          aria-label="צ׳אט צוות"
          onClick={() => {
            if (panel === "chat") setPanel("none");
            else openChat();
          }}
        >
          <Image
            src="/brand/logo.png"
            alt=""
            width={52}
            height={52}
            className="fab-logo"
          />
          {unreadChat > 0 && (
            <span key={`c-${unreadChat}`} className="fab-badge badge-pop">
              {unreadChat > 99 ? "99+" : unreadChat}
            </span>
          )}
        </button>
      </div>
    </>
  );
}
