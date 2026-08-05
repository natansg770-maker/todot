/** Shared helpers for remote storage failures (Blob / GitHub). */

export function isUnavailableStorageError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return (
    lower.includes("403") ||
    lower.includes("forbidden") ||
    lower.includes("suspended") ||
    lower.includes("store is blocked") ||
    lower.includes("store_suspended") ||
    lower.includes("usage threshold") ||
    lower.includes("billing") ||
    lower.includes("unauthorized") ||
    lower.includes("bad credentials") ||
    lower.includes("401") ||
    lower.includes("blob get failed") ||
    lower.includes("failed to fetch blob") ||
    lower.includes("blob_db_not_found") ||
    lower.includes("github_db_not_found")
  );
}
