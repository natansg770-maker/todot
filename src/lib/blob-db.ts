import {
  BlobNotFoundError,
  BlobPreconditionFailedError,
  get,
  put,
} from "@vercel/blob";
import type { Database } from "./types";

const PATHNAME = "data/db.json";

export function canUseBlobDb(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export class BlobConflictError extends Error {
  constructor() {
    super("BLOB_CONFLICT");
    this.name = "BlobConflictError";
  }
}

export type BlobDbSnapshot = {
  db: Database;
  /** ETag for conditional writes; null when the blob does not exist yet. */
  etag: string | null;
};

/** put/ifMatch expects a strong ETag; private get() may return a weak W/"..." form. */
function strongEtag(etag: string | null | undefined): string | null {
  if (!etag) return null;
  return etag.startsWith("W/") ? etag.slice(2) : etag;
}

async function readPrivateJson(): Promise<BlobDbSnapshot> {
  const result = await get(PATHNAME, {
    access: "private",
    token: process.env.BLOB_READ_WRITE_TOKEN,
    // Critical: do not serve a cached older version after another instance wrote.
    useCache: false,
  });

  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error(`Blob get failed: ${result?.statusCode ?? "unknown"}`);
  }

  const buffer = Buffer.from(await new Response(result.stream).arrayBuffer());
  const db = JSON.parse(buffer.toString("utf8")) as Database;
  return { db, etag: strongEtag(result.blob.etag) };
}

/**
 * Read the Blob DB. Never auto-creates/writes a seed — missing data must not
 * silently wipe production claims.
 */
export async function readBlobDb(): Promise<BlobDbSnapshot> {
  try {
    return await readPrivateJson();
  } catch (error) {
    if (error instanceof BlobNotFoundError) {
      throw new Error("BLOB_DB_NOT_FOUND");
    }
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("not found") ||
      message.includes("404") ||
      message.includes("NoSuchKey") ||
      message.includes("does not exist")
    ) {
      throw new Error("BLOB_DB_NOT_FOUND");
    }
    throw error;
  }
}

export async function writeBlobDb(
  db: Database,
  etag: string | null,
): Promise<{ db: Database; etag: string }> {
  db.updatedAt = new Date().toISOString();

  try {
    const result = await put(PATHNAME, JSON.stringify(db, null, 2), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      token: process.env.BLOB_READ_WRITE_TOKEN,
      // Minimum allowed; private reads also use useCache:false.
      cacheControlMaxAge: 60,
      ...(etag ? { ifMatch: strongEtag(etag) ?? etag } : {}),
    });
    return { db, etag: strongEtag(result.etag) ?? result.etag };
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError) {
      throw new BlobConflictError();
    }
    throw error;
  }
}
