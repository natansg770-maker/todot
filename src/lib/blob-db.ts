import {
  BlobNotFoundError,
  BlobPreconditionFailedError,
  get,
  put,
} from "@vercel/blob";
import { createSeedDatabase } from "./seed";
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
  return { db, etag: result.blob.etag };
}

export async function readBlobDb(): Promise<BlobDbSnapshot> {
  try {
    return await readPrivateJson();
  } catch (error) {
    if (error instanceof BlobNotFoundError) {
      const seed = createSeedDatabase();
      const { etag } = await writeBlobDb(seed, null);
      return { db: seed, etag };
    }
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("not found") ||
      message.includes("404") ||
      message.includes("NoSuchKey") ||
      message.includes("does not exist")
    ) {
      const seed = createSeedDatabase();
      const { etag } = await writeBlobDb(seed, null);
      return { db: seed, etag };
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
      ...(etag ? { ifMatch: etag } : {}),
    });
    return { db, etag: result.etag };
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError) {
      throw new BlobConflictError();
    }
    throw error;
  }
}
