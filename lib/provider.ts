// The one place that talks to the mail service. Resend by default (RESEND_API_KEY): sending, plus reading received
// mail by id. MAIL_PROVIDER=none stores outgoing mail without sending it (local development).
import { conf } from "./config";
export type OutgoingWire = {
  from: string; to: string[]; cc: string[]; bcc: string[]; replyTo?: string; subject: string; text: string; html: string;
  headers: Record<string, string>; attachments: { filename: string; content: Buffer; contentType?: string }[];
};
export type Sender = (m: OutgoingWire) => Promise<{ id: string | null; stored_only?: boolean }>;

const resendKey = () => conf("RESEND_API_KEY");
const resend = async (path: string, init?: RequestInit) =>
  fetch(`https://api.resend.com${path}`, { ...init, headers: { Authorization: `Bearer ${await resendKey()}`, "content-type": "application/json", ...(init?.headers ?? {}) } });

const resendSend: Sender = async m => {
  if (!(await resendKey())) throw new Error("no Resend API key is set up (dashboard → Setup)");
  const body = (headers: Record<string, string>) => JSON.stringify({
    from: m.from, to: m.to, cc: m.cc.length ? m.cc : undefined, bcc: m.bcc.length ? m.bcc : undefined, reply_to: m.replyTo, subject: m.subject,
    text: m.text, html: m.html, headers, attachments: m.attachments.map(a => ({ filename: a.filename, content: a.content.toString("base64"), content_type: a.contentType })),
  });
  let r = await resend("/emails", { method: "POST", body: body(m.headers) });
  if (r.status === 422 && m.headers["Message-ID"]) {           // some setups refuse a custom Message-ID: send without it
    const { ["Message-ID"]: _drop, ...rest } = m.headers; void _drop; r = await resend("/emails", { method: "POST", body: body(rest) });
  }
  const j = await r.json().catch(() => ({})) as { id?: string; message?: string };
  if (!r.ok) throw new Error(j.message || `send failed (${r.status})`);
  return { id: j.id ?? null };
};
const noSend: Sender = async () => ({ id: null, stored_only: true });

let override: Sender | null = null;
/** Tests swap the sender out. */
export const setSender = (s: Sender | null) => { override = s; };
export const sender = async (): Promise<Sender> => override ?? ((await conf("MAIL_PROVIDER")) === "none" ? noSend : resendSend);
export const sendingOn = async () => !!override || (await conf("MAIL_PROVIDER")) === "none" || !!(await resendKey());

/** Resend's email.received webhook carries only an id; the message is read back from Resend so a forged webhook can't plant mail. */
export async function fetchResendReceived(emailId: string) {
  if (!(await resendKey())) throw new Error("no Resend API key is set up");
  const r = await resend(`/emails/receiving/${encodeURIComponent(emailId)}`);
  if (!r.ok) throw new Error(`resend ${r.status}`);
  const m = await r.json() as { from?: string; to?: string[]; cc?: string[]; reply_to?: string[] | string; subject?: string; text?: string; html?: string; message_id?: string;
    headers?: Record<string, string>; attachments?: { id: string; filename?: string; content_type?: string }[] };
  const h = Object.fromEntries(Object.entries(m.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
  const attachments: { filename: string; contentType: string; data: Buffer }[] = [];
  for (const a of m.attachments ?? []) {
    const ar = await resend(`/emails/receiving/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(a.id)}`); if (!ar.ok) continue;
    const meta = await ar.json() as { download_url?: string; filename?: string; content_type?: string };
    if (!meta.download_url) continue;
    const fr = await fetch(meta.download_url); if (!fr.ok) continue;
    attachments.push({ filename: meta.filename || a.filename || "file", contentType: meta.content_type || a.content_type || "application/octet-stream", data: Buffer.from(await fr.arrayBuffer()) });
  }
  return {
    providerId: emailId, messageId: m.message_id || h["message-id"] || null, inReplyTo: h["in-reply-to"] || null, references: h["references"] || "",
    from: m.from || "", to: m.to ?? [], cc: m.cc ?? [], replyTo: Array.isArray(m.reply_to) ? m.reply_to[0] : m.reply_to || null,
    subject: m.subject || "", text: m.text || "", html: m.html || null, attachments,
  };
}
