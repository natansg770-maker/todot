import { createSeedDatabase } from "./seed";
import type { Database } from "./types";

const REPO = process.env.GITHUB_REPOSITORY || "natansg770-maker/todot";
const FILE_PATH = "data/db.json";
const BRANCH = process.env.DB_BRANCH || "cursor/camp-thank-you-coordinator-7a72";

function token(): string | undefined {
  return (
    process.env.GITHUB_DB_TOKEN ||
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN
  );
}

export function canUseGithubDb(): boolean {
  return Boolean(token());
}

async function gh<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token()}`,
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

type ContentResponse = {
  sha: string;
  content: string;
  encoding: string;
};

export async function readGithubDb(): Promise<{ db: Database; sha: string | null }> {
  try {
    const data = await gh<ContentResponse>(
      `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}?ref=${encodeURIComponent(BRANCH)}`,
    );
    const json = Buffer.from(data.content, "base64").toString("utf8");
    return { db: JSON.parse(json) as Database, sha: data.sha };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("404")) {
      const seed = createSeedDatabase();
      const saved = await writeGithubDb(seed, null);
      return saved;
    }
    throw error;
  }
}

export async function writeGithubDb(
  db: Database,
  sha: string | null,
): Promise<{ db: Database; sha: string }> {
  db.updatedAt = new Date().toISOString();
  const body: Record<string, string> = {
    message: `chore: update thank-you database (${db.updatedAt})`,
    content: Buffer.from(JSON.stringify(db, null, 2), "utf8").toString("base64"),
    branch: BRANCH,
  };
  if (sha) body.sha = sha;

  const result = await gh<{ content: { sha: string } }>(
    `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  return { db, sha: result.content.sha };
}
