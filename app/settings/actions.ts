"use server";
import { needAdmin } from "@/lib/admin";
import { createKey } from "@/lib/keys";
import { createHook } from "@/lib/webhooks";
import { revalidatePath } from "next/cache";

export type Shown = { value?: string; error?: string } | null;
export async function newKey(_p: Shown, f: FormData): Promise<Shown> {
  needAdmin();
  const { key } = await createKey(String(f.get("name") || "key"));
  revalidatePath("/settings"); return { value: key };
}
export async function newHook(_p: Shown, f: FormData): Promise<Shown> {
  needAdmin();
  try {
    const h = await createHook({ url: String(f.get("url") || ""), events: f.getAll("events").map(String), inbox_id: String(f.get("inbox") || "") || null });
    revalidatePath("/settings"); return { value: h.secret };
  } catch (e) { return { error: (e as Error).message }; }
}

import { randomBytes } from "node:crypto";
import { fromServer, saveConf } from "@/lib/config";
export async function saveSetup(_p: Shown, f: FormData): Promise<Shown> {
  needAdmin();
  const domains = String(f.get("MAIL_DOMAINS") ?? "").split(/[,\s]+/).map(d => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
  const bad = domains.find(d => !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d));
  if (bad) return { error: `"${bad}" isn't a domain (example: agents.yourcompany.com)` };
  if (f.has("MAIL_DOMAINS")) await saveConf("MAIL_DOMAINS", domains.join(","));
  const key = String(f.get("RESEND_API_KEY") ?? "").trim();
  if (key && !key.startsWith("re_")) return { error: "Resend API keys start with re_" };
  if (key) await saveConf("RESEND_API_KEY", key);
  if (f.get("clear_resend") === "on") await saveConf("RESEND_API_KEY", "");
  if (!fromServer("MAIL_PROVIDER")) await saveConf("MAIL_PROVIDER", f.get("store_only") === "on" ? "none" : "");
  let shown: string | undefined;
  if (f.get("new_inbound") === "on") { shown = `inb_${randomBytes(24).toString("base64url")}`; await saveConf("INBOUND_SECRET", shown); }
  revalidatePath("/settings"); revalidatePath("/");
  return shown ? { value: shown } : { value: "" , error: undefined };
}
