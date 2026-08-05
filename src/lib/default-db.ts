import { promises as fs } from "fs";
import path from "path";
import {
  BlobNotFoundError,
  BlobPreconditionFailedError,
  get,
  put,
} from "@vercel/blob";
import { canUseGithubDb } from "./github-db";
import { isUnavailableStorageError } from "./storage-errors";
import type { Database } from "./types";

const PATHNAME = "data/default-db.json";
const LOCAL_PATH = path.join(process.cwd(), "data", "default-db.json");
const TMP_PATH = path.join("/tmp", "todot-default-db.json");
const REPO = process.env.GITHUB_REPOSITORY || "natansg770-maker/todot";
const BRANCH = process.env.DB_BRANCH || "cursor/camp-thank-you-coordinator-7a72";

let blobDisabled = false;
let githubSha: string | null = null;
let blobEtag: string | null = null;

function canUseBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN) && !blobDisabled;
}

function githubToken(): string | undefined {
  return (
    process.env.GITHUB_DB_TOKEN ||
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN
  );
}

function strongEtag(etag: string | null | undefined): string | null {
  if (!etag) return null;
  return etag.startsWith("W/") ? etag.slice(2) : etag;
}

function cloneDb(db: Database): Database {
  return JSON.parse(JSON.stringify(db)) as Database;
}

async function gh<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubToken()}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function readFromBlob(): Promise<Database | null> {
  if (!canUseBlob()) return null;
  try {
    const result = await get(PATHNAME, {
      access: "private",
      token: process.env.BLOB_READ_WRITE_TOKEN,
      useCache: false,
    });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    blobEtag = strongEtag(result.blob.etag);
    const buffer = Buffer.from(await new Response(result.stream).arrayBuffer());
    return JSON.parse(buffer.toString("utf8")) as Database;
  } catch (error) {
    if (isUnavailableStorageError(error)) {
      blobDisabled = true;
      return null;
    }
    if (
      error instanceof BlobNotFoundError ||
      (error instanceof Error &&
        (error.message.includes("not found") ||
          error.message.includes("404") ||
          error.message.includes("NoSuchKey")))
    ) {
      return null;
    }
    throw error;
  }
}

async function writeToBlob(db: Database): Promise<boolean> {
  if (!canUseBlob()) return false;
  try {
    const result = await put(PATHNAME, JSON.stringify(db, null, 2), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      token: process.env.BLOB_READ_WRITE_TOKEN,
      cacheControlMaxAge: 60,
      ...(blobEtag ? { ifMatch: strongEtag(blobEtag) ?? blobEtag } : {}),
    });
    blobEtag = strongEtag(result.etag) ?? result.etag;
    return true;
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError) {
      blobEtag = null;
      const result = await put(PATHNAME, JSON.stringify(db, null, 2), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
        token: process.env.BLOB_READ_WRITE_TOKEN,
        cacheControlMaxAge: 60,
      });
      blobEtag = strongEtag(result.etag) ?? result.etag;
      return true;
    }
    if (isUnavailableStorageError(error)) {
      blobDisabled = true;
      return false;
    }
    throw error;
  }
}

async function readFromGithub(): Promise<Database | null> {
  if (!canUseGithubDb() || !githubToken()) return null;
  try {
    const data = await gh<{ content: string; sha: string }>(
      `https://api.github.com/repos/${REPO}/contents/${PATHNAME}?ref=${encodeURIComponent(BRANCH)}`,
    );
    githubSha = data.sha;
    return JSON.parse(
      Buffer.from(data.content, "base64").toString("utf8"),
    ) as Database;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("404")) {
      githubSha = null;
      return null;
    }
    if (isUnavailableStorageError(error)) return null;
    throw error;
  }
}

async function writeToGithub(db: Database): Promise<boolean> {
  if (!canUseGithubDb() || !githubToken()) return false;
  try {
    if (!githubSha) {
      try {
        const existing = await gh<{ sha: string }>(
          `https://api.github.com/repos/${REPO}/contents/${PATHNAME}?ref=${encodeURIComponent(BRANCH)}`,
        );
        githubSha = existing.sha;
      } catch {
        githubSha = null;
      }
    }
    const body: Record<string, string> = {
      message: `chore: save system default snapshot (${db.updatedAt})`,
      content: Buffer.from(JSON.stringify(db, null, 2), "utf8").toString(
        "base64",
      ),
      branch: BRANCH,
    };
    if (githubSha) body.sha = githubSha;
    const result = await gh<{ content: { sha: string } }>(
      `https://api.github.com/repos/${REPO}/contents/${PATHNAME}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    githubSha = result.content.sha;
    return true;
  } catch (error) {
    if (isUnavailableStorageError(error)) return false;
    throw error;
  }
}

async function readFromLocal(): Promise<Database | null> {
  for (const filePath of [TMP_PATH, LOCAL_PATH]) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      return JSON.parse(raw) as Database;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function writeToLocal(db: Database): Promise<void> {
  const body = JSON.stringify(db, null, 2);
  try {
    await fs.mkdir(path.dirname(LOCAL_PATH), { recursive: true });
    await fs.writeFile(LOCAL_PATH, body, "utf8");
    return;
  } catch {
    /* serverless cwd may be read-only */
  }
  await fs.writeFile(TMP_PATH, body, "utf8");
}

/** Load the admin-saved default snapshot, if one exists. */
export async function readDefaultDatabase(): Promise<Database | null> {
  const fromBlob = await readFromBlob();
  if (fromBlob) return cloneDb(fromBlob);
  const fromGithub = await readFromGithub();
  if (fromGithub) return cloneDb(fromGithub);
  const fromLocal = await readFromLocal();
  if (fromLocal) return cloneDb(fromLocal);
  return null;
}

/** Persist the given database as the system default for future resets. */
export async function writeDefaultDatabase(db: Database): Promise<Database> {
  const snapshot = cloneDb(db);
  snapshot.updatedAt = new Date().toISOString();

  const blobOk = await writeToBlob(snapshot);
  const githubOk = await writeToGithub(snapshot);
  await writeToLocal(snapshot);

  if (!blobOk && !githubOk) {
    // Local/tmp write still happened — enough for single-instance fallback.
  }

  return snapshot;
}
