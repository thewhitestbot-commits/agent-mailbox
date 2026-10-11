// API keys: shown once, stored only as a SHA-256 hash. Requests send "Authorization: Bearer am_...".
import { randomBytes } from "node:crypto";
import { q, one } from "./db";
import { sha256 } from "./util";

export async function createKey(name: string) {
  const key = `am_${randomBytes(24).toString("base64url")}`;
  const [row] = await q<{ id: number }>("insert into api_keys (name, prefix, hash) values ($1,$2,$3) returning id", [name.slice(0, 80), key.slice(0, 10), sha256(key)]);
  return { id: row.id, key };
}
export async function checkKey(key: string | null | undefined) {
  if (!key || !key.startsWith("am_")) return null;
  const row = await one<{ id: number }>("update api_keys set last_used_at = now() where hash = $1 and revoked_at is null returning id", [sha256(key)]);
  return row ?? null;
}
export const bearer = (req: Request) => (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim() || null;
