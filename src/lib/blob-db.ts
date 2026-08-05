import { head, put } from "@vercel/blob";
import { createSeedDatabase } from "./seed";
import type { Database } from "./types";

const PATHNAME = "data/db.json";

export function canUseBlobDb(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function readBlobDb(): Promise<Database> {
  try {
    const meta = await head(PATHNAME, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    const res = await fetch(meta.url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Blob fetch failed: ${res.status}`);
    }
    return (await res.json()) as Database;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Missing blob => seed
    if (
      message.includes("not found") ||
      message.includes("404") ||
      message.includes("NoSuchKey") ||
      message.includes("does not exist")
    ) {
      const seed = createSeedDatabase();
      await writeBlobDb(seed);
      return seed;
    }
    throw error;
  }
}

export async function writeBlobDb(db: Database): Promise<Database> {
  db.updatedAt = new Date().toISOString();
  await put(PATHNAME, JSON.stringify(db, null, 2), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  return db;
}
