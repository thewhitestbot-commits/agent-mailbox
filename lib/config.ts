// Settings come from the server's environment first, then from what was saved on the dashboard's Setup screen.
// Only DATABASE_URL and ADMIN_PASSWORD must be environment variables; everything else can be pasted in the dashboard.
import { q, one } from "./db";

export const SETTINGS = ["MAIL_DOMAINS", "RESEND_API_KEY", "INBOUND_SECRET", "MAIL_PROVIDER"] as const;
export type Setting = typeof SETTINGS[number];

export async function conf(name: Setting): Promise<string> {
  const env = process.env[name]?.trim(); if (env) return env;
  return (await one<{ value: string }>("select value from settings where key = $1", [name]))?.value?.trim() || "";
}
export const fromServer = (name: Setting) => !!process.env[name]?.trim();
export async function saveConf(name: Setting, value: string) {
  if (fromServer(name)) return;                       // the server's own setting always wins; nothing to save
  const v = value.trim();
  if (v) await q("insert into settings (key, value) values ($1,$2) on conflict (key) do update set value = excluded.value", [name, v]);
  else await q("delete from settings where key = $1", [name]);
}
/** The domains inboxes may live on, e.g. "agents.example.com,mail.example.org". */
export async function getDomains() {
  return (await conf("MAIL_DOMAINS")).split(",").map(d => d.trim().toLowerCase().replace(/^@/, "")).filter(d => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d));
}
