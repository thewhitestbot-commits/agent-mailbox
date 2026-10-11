// Inboxes, threads and messages: everything the API, the MCP tools and the dashboard share.
import { q, one } from "./db";
import { addrList, addrOf, cleanLocal, cleanSubject, domains, htmlToText, idList, newId, randomLocal, replySubject, textToHtml } from "./util";
import { sender } from "./provider";
import { fire } from "./webhooks";

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

export type Inbox = { id: string; address: string; display_name: string; client_id: string | null; metadata: Record<string, unknown>; created_at: string };
type MsgRow = { id: string; inbox_id: string; thread_id: string; direction: string; message_id: string | null; in_reply_to: string | null; refs: string[];
  from_addr: string; to_addrs: string[]; cc_addrs: string[]; reply_to: string | null; subject: string; text_body: string; html_body: string | null;
  labels: string[]; read: boolean; status: string; error: string | null; created_at: string };
const INBOX_COLS = "id, address, display_name, client_id, metadata, created_at::text as created_at";
const MSG_COLS = "id, inbox_id, thread_id, direction, message_id, in_reply_to, refs, from_addr, to_addrs, cc_addrs, reply_to, subject, text_body, html_body, labels, read, status, error, created_at::text as created_at";

// ---------- inboxes ----------
export async function createInbox(o: { username?: string; domain?: string; display_name?: string; client_id?: string; metadata?: Record<string, unknown> } = {}) {
  const ds = domains(); if (!ds.length) throw new ApiError(500, "MAIL_DOMAINS is not set on the server");
  const domain = (o.domain || ds[0]).toLowerCase(); if (!ds.includes(domain)) throw new ApiError(400, `domain must be one of: ${ds.join(", ")}`);
  const clientId = o.client_id ? String(o.client_id).slice(0, 200) : null;
  if (clientId) { const had = await one<Inbox>(`select ${INBOX_COLS} from inboxes where client_id = $1 and deleted_at is null`, [clientId]); if (had) return had; }
  const local = o.username ? cleanLocal(o.username) : randomLocal();
  if (!local) throw new ApiError(400, "username has no usable characters");
  const address = `${local}@${domain}`;
  const meta = o.metadata && typeof o.metadata === "object" ? o.metadata : {};
  const row = await one<Inbox>(`insert into inboxes (id, address, display_name, client_id, metadata) values ($1,$2,$3,$4,$5) on conflict do nothing returning ${INBOX_COLS}`,
    [newId("inb"), address, String(o.display_name ?? "").slice(0, 120), clientId, JSON.stringify(meta)]);
  if (!row) throw new ApiError(409, `${address} is taken`);
  return row;
}
export const listInboxes = (limit = 100) => q<Inbox>(`select ${INBOX_COLS} from inboxes where deleted_at is null order by created_at desc limit $1`, [Math.min(Math.max(limit, 1), 500)]);
export async function getInbox(idOrAddress: string) {
  const row = await one<Inbox>(`select ${INBOX_COLS} from inboxes where (id = $1 or address = lower($1)) and deleted_at is null`, [idOrAddress]);
  if (!row) throw new ApiError(404, "inbox not found");
  return row;
}
export async function updateInbox(id: string, o: { display_name?: string; metadata?: Record<string, unknown> }) {
  const ib = await getInbox(id);
  await q("update inboxes set display_name = coalesce($2, display_name), metadata = coalesce($3::jsonb, metadata) where id = $1",
    [ib.id, o.display_name === undefined ? null : String(o.display_name).slice(0, 120), o.metadata === undefined ? null : JSON.stringify(o.metadata)]);
  return getInbox(ib.id);
}
/** Deleting frees nothing: the address stays reserved (renamed) so old mail can never reach a new owner. */
export async function deleteInbox(id: string) {
  const ib = await getInbox(id);
  await q("update inboxes set deleted_at = now(), address = address || '.deleted.' || id, client_id = null where id = $1", [ib.id]);
  return { id: ib.id, deleted: true };
}

// ---------- reading ----------
async function attachmentsFor(ids: string[]) {
  if (!ids.length) return new Map<string, { id: string; filename: string; content_type: string; bytes: number }[]>();
  const rows = await q<{ id: string; message_id: string; filename: string; content_type: string; bytes: number }>("select id, message_id, filename, content_type, bytes from attachments where message_id = any($1) order by id", [ids]);
  const m = new Map<string, { id: string; filename: string; content_type: string; bytes: number }[]>();
  for (const { message_id, ...a } of rows) m.set(message_id, [...(m.get(message_id) ?? []), a]);
  return m;
}
function shape(r: MsgRow, atts: { id: string; filename: string; content_type: string; bytes: number }[] = [], full = true) {
  return {
    id: r.id, inbox_id: r.inbox_id, thread_id: r.thread_id, direction: r.direction, status: r.status, ...(r.error ? { error: r.error } : {}),
    from: r.from_addr, to: r.to_addrs, cc: r.cc_addrs, reply_to: r.reply_to, subject: r.subject,
    ...(full ? { text: r.text_body, html: r.html_body } : { preview: r.text_body.replace(/\s+/g, " ").slice(0, 160) }),
    labels: r.labels, read: r.read, attachments: atts, message_id: r.message_id, in_reply_to: r.in_reply_to, created_at: r.created_at,
  };
}
export type Message = ReturnType<typeof shape>;
export async function listMessages(inboxId: string, o: { limit?: number; before?: string; unread?: boolean; label?: string; direction?: string; thread_id?: string; full?: boolean } = {}) {
  const ib = await getInbox(inboxId);
  const args: unknown[] = [ib.id]; const where = ["inbox_id = $1"];
  if (o.unread) where.push("not read");
  if (o.label) { args.push(o.label); where.push(`$${args.length} = any(labels)`); }
  if (o.direction === "in" || o.direction === "out") { args.push(o.direction); where.push(`direction = $${args.length}`); }
  if (o.thread_id) { args.push(o.thread_id); where.push(`thread_id = $${args.length}`); }
  if (o.before) { args.push(o.before); where.push(`(created_at, id) < (select created_at, id from messages where id = $${args.length})`); }
  const limit = Math.min(Math.max(Number(o.limit) || 25, 1), 100); args.push(limit + 1);
  const rows = await q<MsgRow>(`select ${MSG_COLS} from messages where ${where.join(" and ")} order by created_at desc, id desc limit $${args.length}`, args);
  const page = rows.slice(0, limit), atts = await attachmentsFor(page.map(r => r.id));
  return { messages: page.map(r => shape(r, atts.get(r.id), !!o.full)), next_before: rows.length > limit ? page[page.length - 1].id : null };
}
export async function getMessage(id: string) {
  const r = await one<MsgRow>(`select ${MSG_COLS} from messages where id = $1`, [id]);
  if (!r) throw new ApiError(404, "message not found");
  return shape(r, (await attachmentsFor([r.id])).get(r.id));
}
export async function updateMessage(id: string, o: { read?: boolean; add_labels?: string[]; remove_labels?: string[] }) {
  await getMessage(id);
  const clean = (l?: string[]) => (l ?? []).map(x => String(x).trim().toLowerCase().slice(0, 40)).filter(Boolean);
  await q(`update messages set read = coalesce($2, read),
    labels = array(select distinct x from unnest(array_cat(labels, $3::text[])) x where not (x = any($4::text[]))) where id = $1`,
    [id, typeof o.read === "boolean" ? o.read : null, clean(o.add_labels), clean(o.remove_labels)]);
  return getMessage(id);
}
export async function getThread(id: string) {
  const t = await one<{ id: string; inbox_id: string; subject: string; message_count: number; last_message_at: string }>("select id, inbox_id, subject, message_count, last_message_at::text as last_message_at from threads where id = $1", [id]);
  if (!t) throw new ApiError(404, "thread not found");
  const rows = await q<MsgRow>(`select ${MSG_COLS} from messages where thread_id = $1 order by created_at, id`, [id]);
  const atts = await attachmentsFor(rows.map(r => r.id));
  return { ...t, messages: rows.map(r => shape(r, atts.get(r.id))) };
}
export async function listThreads(inboxId: string, limit = 25) {
  const ib = await getInbox(inboxId);
  return q("select id, subject, message_count, last_message_at::text as last_message_at from threads where inbox_id = $1 order by last_message_at desc limit $2", [ib.id, Math.min(Math.max(limit, 1), 100)]);
}
export async function getAttachment(messageId: string, attId: string) {
  const a = await one<{ filename: string; content_type: string; data: Buffer }>("select filename, content_type, data from attachments where id = $1 and message_id = $2", [attId, messageId]);
  if (!a) throw new ApiError(404, "attachment not found");
  return a;
}

// ---------- threads ----------
/** Same conversation = it answers a message we hold (In-Reply-To / References), else the same subject with the same person in the last 30 days. */
async function threadFor(inboxId: string, subject: string, ids: string[], counterpart: string) {
  if (ids.length) {
    const hit = await one<{ thread_id: string }>("select thread_id from messages where inbox_id = $1 and message_id = any($2) order by created_at desc limit 1", [inboxId, ids]);
    if (hit) return hit.thread_id;
  }
  const s = cleanSubject(subject).toLowerCase();
  if (s && counterpart) {
    const hit = await one<{ thread_id: string }>(`select m.thread_id from messages m join threads t on t.id = m.thread_id where m.inbox_id = $1 and lower(t.subject) = $2
      and (m.from_addr = $3 or $3 = any(m.to_addrs)) and m.created_at > now() - interval '30 days' order by m.created_at desc limit 1`, [inboxId, s, counterpart]);
    if (hit) return hit.thread_id;
  }
  const id = newId("thr");
  await q("insert into threads (id, inbox_id, subject) values ($1,$2,$3)", [id, inboxId, cleanSubject(subject).slice(0, 300)]);
  return id;
}
const bump = (threadId: string) => q("update threads set message_count = message_count + 1, last_message_at = now() where id = $1", [threadId]);

// ---------- receiving ----------
export type Incoming = {
  providerId?: string | null; messageId?: string | null; inReplyTo?: string | null; references?: string | string[]; from: string; to: string[]; cc?: string[];
  replyTo?: string | null; subject?: string; text?: string; html?: string | null; attachments?: { filename: string; contentType: string; data: Buffer }[];
  envelopeTo?: string[];   // the real recipients when the mail service knows them (bcc'd inboxes)
};
/** Files one received email into every inbox it was addressed to. Returns the stored message ids. */
export async function ingest(m: Incoming) {
  const rcpts = [...new Set([...addrList(m.to), ...addrList(m.cc ?? []), ...addrList(m.envelopeTo ?? [])])];
  const boxes = rcpts.length ? await q<{ id: string; address: string }>("select id, address from inboxes where address = any($1) and deleted_at is null", [rcpts]) : [];
  const from = addrOf(m.from), refs = idList(m.references ?? ""), inReplyTo = idList(m.inReplyTo ?? "")[0] ?? null;
  const text = m.text?.trim() ? m.text : m.html ? htmlToText(m.html) : "";
  const saved: string[] = [];
  for (const b of boxes) {
    if (m.providerId && await one("select 1 from messages where inbox_id = $1 and provider_id = $2", [b.id, m.providerId])) continue;
    if (m.messageId && await one("select 1 from messages where inbox_id = $1 and message_id = $2 and direction = 'in'", [b.id, m.messageId])) continue;
    const threadId = await threadFor(b.id, m.subject ?? "", [...(inReplyTo ? [inReplyTo] : []), ...refs].reverse(), from);
    const id = newId("msg");
    await q(`insert into messages (id, inbox_id, thread_id, direction, message_id, in_reply_to, refs, from_addr, to_addrs, cc_addrs, reply_to, subject, text_body, html_body, provider_id, status)
      values ($1,$2,$3,'in',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'received')`,
      [id, b.id, threadId, m.messageId ?? null, inReplyTo, refs, from, addrList(m.to), addrList(m.cc ?? []), m.replyTo ? addrOf(m.replyTo) : null, (m.subject || "(no subject)").slice(0, 998), text, m.html ?? null, m.providerId ?? null]);
    for (const a of m.attachments ?? []) await q("insert into attachments (id, message_id, filename, content_type, bytes, data) values ($1,$2,$3,$4,$5,$6)", [newId("att"), id, a.filename.slice(0, 255), a.contentType, a.data.length, a.data]);
    await bump(threadId);
    saved.push(id);
    await fire("message.received", b.id, await getMessage(id)).catch(() => null);
  }
  return saved;
}

// ---------- sending ----------
export type Outgoing = { to?: string | string[]; cc?: string | string[]; bcc?: string | string[]; subject?: string; text?: string; html?: string; labels?: string[];
  attachments?: { filename: string; content: string; content_type?: string }[] };
const MAX_ATTACH = 20 * 1024 * 1024;
async function deliver(ib: Inbox, o: Outgoing, thread: { id: string | null; inReplyTo: string | null; refs: string[] }) {
  const to = addrList(o.to ?? []), cc = addrList(o.cc ?? []), bcc = addrList(o.bcc ?? []);
  if (!to.length) throw new ApiError(400, "to needs at least one valid address");
  if (to.length + cc.length + bcc.length > 50) throw new ApiError(400, "50 recipients at most");
  const text = o.text ?? (o.html ? htmlToText(o.html) : ""), subject = (o.subject ?? "").slice(0, 998);
  if (!text.trim() && !subject.trim()) throw new ApiError(400, "send a subject or a body");
  const files = (o.attachments ?? []).map(a => ({ filename: String(a.filename || "file").slice(0, 255), content: Buffer.from(String(a.content || ""), "base64"), contentType: a.content_type || "application/octet-stream" }));
  if (files.reduce((n, f) => n + f.content.length, 0) > MAX_ATTACH) throw new ApiError(400, "attachments are limited to 20 MB in total");
  const domain = ib.address.split("@")[1], id = newId("msg"), messageId = `<${id}@${domain}>`;
  const threadId = thread.id ?? await threadFor(ib.id, subject, [], to[0]);
  const headers: Record<string, string> = { "Message-ID": messageId };
  if (thread.inReplyTo) { headers["In-Reply-To"] = thread.inReplyTo; headers["References"] = [...thread.refs, thread.inReplyTo].join(" "); }
  await q(`insert into messages (id, inbox_id, thread_id, direction, message_id, in_reply_to, refs, from_addr, to_addrs, cc_addrs, subject, text_body, html_body, labels, read, status)
    values ($1,$2,$3,'out',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,'sending')`,
    [id, ib.id, threadId, messageId, thread.inReplyTo, thread.refs, ib.address, to, cc, subject, text, o.html ?? null, (o.labels ?? []).map(l => String(l).toLowerCase().slice(0, 40))]);
  for (const f of files) await q("insert into attachments (id, message_id, filename, content_type, bytes, data) values ($1,$2,$3,$4,$5,$6)", [newId("att"), id, f.filename, f.contentType, f.content.length, f.content]);
  await bump(threadId);
  try {
    const r = await sender()({ from: ib.display_name ? `"${ib.display_name.replace(/["\\]/g, "")}" <${ib.address}>` : ib.address, to, cc, bcc, subject, text, html: o.html ?? textToHtml(text), headers, attachments: files });
    await q("update messages set status = $3, provider_id = $2 where id = $1", [id, r.id, r.stored_only ? "stored" : "sent"]);
    const msg = await getMessage(id); await fire("message.sent", ib.id, msg).catch(() => null); return msg;
  } catch (e) {
    await q("update messages set status = 'failed', error = $2 where id = $1", [id, (e as Error).message.slice(0, 500)]);
    const msg = await getMessage(id); await fire("message.failed", ib.id, msg).catch(() => null);
    throw new ApiError(502, `send failed: ${(e as Error).message}`);
  }
}
export async function send(inboxId: string, o: Outgoing) { return deliver(await getInbox(inboxId), o, { id: null, inReplyTo: null, refs: [] }); }
/** Reply to a message: goes to its sender (or Reply-To), same thread, proper In-Reply-To/References. reply_all adds the other recipients. */
export async function reply(messageId: string, o: Outgoing & { reply_all?: boolean }) {
  const r = await one<MsgRow>(`select ${MSG_COLS} from messages where id = $1`, [messageId]);
  if (!r) throw new ApiError(404, "message not found");
  const ib = await getInbox(r.inbox_id);
  const back = r.direction === "in" ? [r.reply_to || r.from_addr] : r.to_addrs;
  const others = o.reply_all ? [...r.to_addrs, ...r.cc_addrs].filter(a => a !== ib.address && !back.includes(a)) : [];
  return deliver(ib, { ...o, to: o.to ?? back, cc: o.cc ?? others, subject: o.subject ?? replySubject(r.subject) }, { id: r.thread_id, inReplyTo: r.message_id, refs: r.refs });
}
