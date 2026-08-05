import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";

/** Default personal passwords for the 11 senior staff members. */
export const DEFAULT_SENIOR_PASSWORDS: Record<string, string> = {
  "לוי יצחק ורדי": "verdi770",
  "נחמן ברדה": "barda770",
  "מנחם מענדל גבירץ": "gviratz770",
  "אליעזר נתן קפלן": "kaplan770",
  "נתן שמחה גרינברג": "natan770",
  "לוי יצחק ערד": "arad770",
  "שמואל פינחס חזן": "hazan770",
  "מנחם מענדל בורנשטיין": "born770",
  "מענדל קשת": "keshet770",
  "חיים וייספיש": "weiss770",
  "יעקב קנייבסקי": "kaniev770",
};

export const SENIOR_NAMES = new Set(Object.keys(DEFAULT_SENIOR_PASSWORDS));

export function hashPassword(password: string, salt?: string): string {
  const realSalt = salt ?? randomBytes(16).toString("hex");
  const hash = scryptSync(password, realSalt, 32).toString("hex");
  return `${realSalt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 32);
  const prev = Buffer.from(hash, "hex");
  if (prev.length !== next.length) return false;
  return timingSafeEqual(prev, next);
}

export function fingerprintPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex").slice(0, 12);
}
