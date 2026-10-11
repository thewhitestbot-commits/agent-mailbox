import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const newId = (prefix: string) => `${prefix}_${randomBytes(12).toString("base64url")}`;
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const hmac = (secret: string, body: string) => createHmac("sha256", secret).update(body).digest("hex");
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** "Ana <ana@x.com>" → ana@x.com (lowercased). */
export const addrOf = (s: string | null | undefined) => ((s || "").match(/<([^>]+)>/)?.[1] || s || "").trim().toLowerCase();
/** Comma/semicolon lists, arrays or single strings → clean, unique addresses. */
export function addrList(v: unknown): string[] {
  const parts = Array.isArray(v) ? v.flatMap(x => String(x).split(/[,;]/)) : String(v ?? "").split(/[,;]/);
  return [...new Set(parts.map(addrOf).filter(a => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(a)))];
}
export const cleanSubject = (s: string | null | undefined) => (s || "").replace(/^\s*((re|fwd?|fw|aw|sv)\s*:\s*)+/i, "").trim();
export const replySubject = (s: string) => (/^\s*re\s*:/i.test(s) ? s : `Re: ${cleanSubject(s) || s}`);
/** Message-ID lists ("<a@x> <b@y>") → ["<a@x>", "<b@y>"]. */
export const idList = (v: string | string[] | null | undefined) => (Array.isArray(v) ? v.join(" ") : v || "").match(/<[^<>\s]+>/g) ?? [];

/** A safe local part: lowercase letters, digits, dots, dashes, underscores; 1–64 chars. */
export function cleanLocal(s: string) {
  const l = s.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[.-]+|[.-]+$/g, "").replace(/\.{2,}/g, ".");
  return l.slice(0, 64);
}
const WORDS = ["amber", "brisk", "cedar", "delta", "ember", "frost", "grove", "harbor", "iris", "juniper", "kestrel", "lumen", "maple", "nova", "onyx", "pine", "quartz", "river", "slate", "tide", "umber", "vale", "willow", "zephyr"];
export const randomLocal = () => `${WORDS[randomBytes(1)[0] % WORDS.length]}-${WORDS[randomBytes(1)[0] % WORDS.length]}-${randomBytes(3).toString("hex")}`;

export const htmlToText = (h: string) => h.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, "").replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, "\n").replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const textToHtml = (t: string) => `<div style="font-family:-apple-system,system-ui,Segoe UI,sans-serif;font-size:15px;line-height:1.55">${esc(t).replace(/(https?:\/\/[^\s<]+)/g, u => `<a href="${u}">${u}</a>`).replace(/\n/g, "<br>")}</div>`;
