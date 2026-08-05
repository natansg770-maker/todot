import { BlobNotFoundError, get, put } from "@vercel/blob";
import { createSeedDatabase } from "./seed";
import type { Database } from "./types";

const PATHNAME = "data/db.json";

export function canUseBlobDb(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function readPrivateJson(): Promise<Database> {
  const result = await get(PATHNAME, {
    access: "private",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error(`Blob get failed: ${result?.statusCode ?? "unknown"}`);
  }

  const buffer = Buffer.from(await new Response(result.stream).arrayBuffer());
  return JSON.parse(buffer.toString("utf8")) as Database;
}

export async function readBlobDb(): Promise<Database> {
  try {
    return await readPrivateJson();
  } catch (error) {
    if (error instanceof BlobNotFoundError) {
      const seed = createSeedDatabase();
      await writeBlobDb(seed);
      return seed;
    }
    const message = error instanceof Error ? error.message : String(error);
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
