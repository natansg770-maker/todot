import { promises as fs } from "fs";
import path from "path";
import {
  BlobNotFoundError,
  BlobPreconditionFailedError,
  get,
  put,
} from "@vercel/blob";
import { isUnavailableStorageError } from "./storage-errors";
import type {
  ActivityEvent,
  ChatMessage,
  LiveStore,
  PresenceEntry,
} from "./types";

const PATHNAME = "data/live.json";
const LOCAL_PATH = path.join(process.cwd(), "data", "live.json");
const TMP_PATH = path.join("/tmp", "todot-live.json");
const MAX_ACTIVITY = 40;
const MAX_CHAT = 120;
const ONLINE_MS = 45_000;
const MAX_MUTATION_RETRIES = 10;

let mutationChain: Promise<unknown> = Promise.resolve();
let blobEtag: string | null = null;
let blobDisabled = false;
let memoryStore: LiveStore | null = null;

function canUseBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN) && !blobDisabled;
}

function strongEtag(etag: string | null | undefined): string | null {
  if (!etag) return null;
  return etag.startsWith("W/") ? etag.slice(2) : etag;
}

function emptyLive(): LiveStore {
  return {
    presence: {},
    activity: [],
    chat: [],
    updatedAt: new Date().toISOString(),
  };
}

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeStore(data: LiveStore): LiveStore {
  if (!data.presence) data.presence = {};
  if (!Array.isArray(data.activity)) data.activity = [];
  if (!Array.isArray(data.chat)) data.chat = [];
  return data;
}

async function ensureLiveSeed(): Promise<LiveStore> {
  const seed = emptyLive();
  blobEtag = null;
  memoryStore = seed;
  try {
    await writeRaw(seed, null);
  } catch {
    /* ignore — in-memory seed is enough for reads */
  }
  return seed;
}

async function readRaw(): Promise<LiveStore> {
  if (canUseBlob()) {
    try {
      const result = await get(PATHNAME, {
        access: "private",
        token: process.env.BLOB_READ_WRITE_TOKEN,
        useCache: false,
      });
      if (!result || result.statusCode !== 200 || !result.stream) {
        return ensureLiveSeed();
      }
      blobEtag = strongEtag(result.blob.etag);
      const buffer = Buffer.from(await new Response(result.stream).arrayBuffer());
      const store = normalizeStore(JSON.parse(buffer.toString("utf8")) as LiveStore);
      memoryStore = store;
      return store;
    } catch (error) {
      if (isUnavailableStorageError(error)) {
        blobDisabled = true;
      } else if (
        error instanceof BlobNotFoundError ||
        (error instanceof Error &&
          (error.message.includes("not found") ||
            error.message.includes("404") ||
            error.message.includes("NoSuchKey") ||
            error.message.includes("Live blob get failed")))
      ) {
        return ensureLiveSeed();
      } else {
        throw error;
      }
    }
  }

  for (const filePath of [TMP_PATH, LOCAL_PATH]) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const store = normalizeStore(JSON.parse(raw) as LiveStore);
      memoryStore = store;
      return store;
    } catch {
      /* try next */
    }
  }

  if (memoryStore) return normalizeStore(structuredClone(memoryStore));
  return emptyLive();
}

async function writeRaw(store: LiveStore, etag: string | null): Promise<void> {
  store.updatedAt = new Date().toISOString();
  memoryStore = store;
  const body = JSON.stringify(store, null, 2);

  if (canUseBlob()) {
    try {
      const result = await put(PATHNAME, body, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
        token: process.env.BLOB_READ_WRITE_TOKEN,
        cacheControlMaxAge: 60,
        ...(etag ? { ifMatch: strongEtag(etag) ?? etag } : {}),
      });
      blobEtag = strongEtag(result.etag) ?? result.etag;
      return;
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) {
        throw new Error("LIVE_CONFLICT");
      }
      if (isUnavailableStorageError(error)) {
        blobDisabled = true;
      } else {
        throw error;
      }
    }
  }

  try {
    await fs.mkdir(path.dirname(LOCAL_PATH), { recursive: true });
    await fs.writeFile(LOCAL_PATH, body, "utf8");
    return;
  } catch {
    /* serverless often blocks writes under cwd */
  }

  await fs.writeFile(TMP_PATH, body, "utf8");
}

async function mutateLive<T>(fn: (store: LiveStore) => T | Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < MAX_MUTATION_RETRIES; attempt++) {
      const store = await readRaw();
      const result = await fn(store);
      try {
        await writeRaw(store, blobEtag);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (lastError.message !== "LIVE_CONFLICT" && attempt > 2) break;
        await new Promise((r) => setTimeout(r, 40 * (attempt + 1)));
      }
    }
    throw lastError ?? new Error("לא הצלחנו לעדכן את לוח החי");
  };

  const next = mutationChain.then(run, run);
  mutationChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export function isOnline(entry: PresenceEntry, now = Date.now()): boolean {
  return now - new Date(entry.lastSeen).getTime() <= ONLINE_MS;
}

export async function getLiveSnapshot(): Promise<{
  onlineCount: number;
  online: { id: string; name: string }[];
  activity: ActivityEvent[];
  chat: ChatMessage[];
  serverTime: string;
}> {
  const store = await readRaw();
  const now = Date.now();
  const online = Object.entries(store.presence)
    .filter(([, entry]) => isOnline(entry, now))
    .map(([id, entry]) => ({ id, name: entry.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "he"));

  return {
    onlineCount: online.length,
    online,
    activity: store.activity
      .filter((e) => e.type !== "login")
      .slice(0, MAX_ACTIVITY),
    chat: (store.chat ?? []).slice(-MAX_CHAT),
    serverTime: new Date().toISOString(),
  };
}

export async function heartbeatPresence(input: {
  userId: string;
  name: string;
}): Promise<{ onlineCount: number }> {
  return mutateLive((store) => {
    const now = Date.now();
    for (const [id, entry] of Object.entries(store.presence)) {
      if (!isOnline(entry, now)) delete store.presence[id];
    }
    store.presence[input.userId] = {
      name: input.name,
      lastSeen: new Date().toISOString(),
    };
    const onlineCount = Object.values(store.presence).filter((e) =>
      isOnline(e, now),
    ).length;
    return { onlineCount };
  });
}

export async function logActivity(input: {
  type: ActivityEvent["type"];
  actorId: string;
  actorName: string;
  message: string;
}): Promise<ActivityEvent> {
  // Login noise made the board look fake — skip it entirely.
  if (input.type === "login") {
    return {
      id: uid("evt"),
      type: input.type,
      actorId: input.actorId,
      actorName: input.actorName,
      message: input.message,
      createdAt: new Date().toISOString(),
    };
  }

  return mutateLive((store) => {
    const event: ActivityEvent = {
      id: uid("evt"),
      type: input.type,
      actorId: input.actorId,
      actorName: input.actorName,
      message: input.message,
      createdAt: new Date().toISOString(),
    };
    store.activity = [event, ...store.activity]
      .filter((e) => e.type !== "login")
      .slice(0, MAX_ACTIVITY);
    return event;
  });
}

export async function postChatMessage(input: {
  senderId: string;
  senderName: string;
  text: string;
}): Promise<ChatMessage> {
  const text = input.text.trim();
  if (!text) throw new Error("נא לכתוב הודעה");
  if (text.length > 500) throw new Error("ההודעה ארוכה מדי");

  return mutateLive((store) => {
    const message: ChatMessage = {
      id: uid("msg"),
      senderId: input.senderId,
      senderName: input.senderName,
      text,
      createdAt: new Date().toISOString(),
    };
    store.chat = [...(store.chat ?? []), message].slice(-MAX_CHAT);
    return message;
  });
}

export async function clearActivityFeed(): Promise<void> {
  await mutateLive((store) => {
    store.activity = [];
  });
}

export async function clearChatFeed(): Promise<void> {
  await mutateLive((store) => {
    store.chat = [];
  });
}
