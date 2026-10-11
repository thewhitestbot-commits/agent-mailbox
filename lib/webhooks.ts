// Outgoing webhooks. Every POST is signed: header "X-Mailbox-Signature: t=<unix>,v1=<hex HMAC-SHA256 of `${t}.${body}`>"
// with the webhook's secret. Up to 3 tries; every try is recorded in webhook_deliveries.
import { q } from "./db";
import { hmac, newId } from "./util";
import { randomBytes } from "node:crypto";

export const EVENTS = ["message.received", "message.sent", "message.failed"] as const;
export type Event = typeof EVENTS[number];

export function validHookUrl(u: string) {
  try {
    const x = new URL(u);
    if (x.protocol === "https:") return true;
    return x.protocol === "http:" && (process.env.ALLOW_HTTP_WEBHOOKS === "1" || ["localhost", "127.0.0.1"].includes(x.hostname));
  } catch { return false; }
}
export async function createHook(o: { url: string; events?: string[]; inbox_id?: string | null }) {
  if (!validHookUrl(o.url)) throw new Error("url must be https");
  const events = (o.events?.length ? o.events : ["message.received"]).filter(e => (EVENTS as readonly string[]).includes(e));
  if (!events.length) throw new Error(`events must be some of: ${EVENTS.join(", ")}`);
  const id = newId("whk"), secret = `whsec_${randomBytes(24).toString("base64url")}`;
  await q("insert into webhooks (id, url, secret, events, inbox_id) values ($1,$2,$3,$4,$5)", [id, o.url, secret, events, o.inbox_id ?? null]);
  return { id, url: o.url, events, inbox_id: o.inbox_id ?? null, secret };
}
export const sign = (secret: string, body: string, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${hmac(secret, `${t}.${body}`)}`;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
export async function fire(event: Event, inboxId: string, data: unknown) {
  const hooks = await q<{ id: string; url: string; secret: string }>(
    "select id, url, secret from webhooks where disabled_at is null and $1 = any(events) and (inbox_id is null or inbox_id = $2)", [event, inboxId]);
  await Promise.all(hooks.map(h => deliver(h, event, { event, created_at: new Date().toISOString(), data })));
}
async function deliver(h: { id: string; url: string; secret: string }, event: string, payload: unknown) {
  const body = JSON.stringify(payload);
  const [d] = await q<{ id: number }>("insert into webhook_deliveries (webhook_id, event, payload) values ($1,$2,$3) returning id", [h.id, event, body]);
  for (let attempt = 1; attempt <= 3; attempt++) {
    let status: number | null = null, error: string | null = null;
    try {
      const r = await fetch(h.url, { method: "POST", body, signal: AbortSignal.timeout(10_000),
        headers: { "content-type": "application/json", "x-mailbox-event": event, "x-mailbox-delivery": String(d.id), "x-mailbox-signature": sign(h.secret, body) } });
      status = r.status;
    } catch (e) { error = (e as Error).message; }
    const ok = status !== null && status >= 200 && status < 300;
    await q("update webhook_deliveries set attempts = $2, status = $3, error = $4, delivered_at = case when $5 then now() else null end where id = $1", [d.id, attempt, status, error, ok]);
    if (ok) return;
    if (attempt < 3) await sleep(attempt * attempt * 500);
  }
}
