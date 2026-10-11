import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Nav from "../Nav";
import { needAdmin } from "@/lib/admin";
import { q } from "@/lib/db";
import { EVENTS } from "@/lib/webhooks";
import { HookForm, KeyForm } from "./Forms";
import { domains } from "@/lib/util";
import { sendingOn } from "@/lib/provider";
export const dynamic = "force-dynamic";

async function revoke(f: FormData) { "use server"; needAdmin(); await q("update api_keys set revoked_at = now() where id = $1", [Number(f.get("id"))]); redirect("/settings"); }
async function dropHook(f: FormData) { "use server"; needAdmin(); await q("update webhooks set disabled_at = now() where id = $1", [String(f.get("id"))]); redirect("/settings"); }

export default async function Settings() {
  needAdmin();
  const keys = await q<{ id: number; name: string; prefix: string; created_at: string; last_used_at: string | null }>("select id, name, prefix, created_at::text created_at, last_used_at::text last_used_at from api_keys where revoked_at is null order by id desc");
  const hooks = await q<{ id: string; url: string; events: string[]; inbox_id: string | null }>("select id, url, events, inbox_id from webhooks where disabled_at is null order by created_at desc");
  const recent = await q<{ id: number; url: string; event: string; status: number | null; attempts: number; error: string | null; created_at: string }>(
    "select d.id, w.url, d.event, d.status, d.attempts, d.error, d.created_at::text created_at from webhook_deliveries d join webhooks w on w.id = d.webhook_id order by d.id desc limit 15");
  const inboxes = await q<{ id: string; address: string }>("select id, address from inboxes where deleted_at is null order by address");
  const host = headers().get("host") || "your-app.example.com", base = `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
  return <><Nav /><div className="wrap">
    <h1>Keys &amp; webhooks</h1>
    <h2>Setup</h2>
    <div className="card small">
      <div>Domains: {domains().length ? domains().map(d => <span key={d} className="tag">{d}</span>) : <span className="bad">MAIL_DOMAINS not set</span>}</div>
      <div>Sending: {process.env.MAIL_PROVIDER === "none" ? <span className="dim">stored only (MAIL_PROVIDER=none)</span> : sendingOn() ? <span className="good">on</span> : <span className="bad">off — set RESEND_API_KEY</span>}</div>
      <div>Receiving (Resend): point Resend's <code>email.received</code> webhook at <code>{base}/api/inbound/resend</code></div>
      <div>Receiving (any mail server): POST raw email to <code>{base}/api/inbound/raw</code> with <code>Authorization: Bearer $INBOUND_SECRET</code> {process.env.INBOUND_SECRET ? <span className="good">(secret set)</span> : <span className="dim">(set INBOUND_SECRET to turn on)</span>}</div>
      <div>MCP: <code>{base}/api/mcp</code> with an API key</div>
    </div>

    <h2>API keys</h2>
    <div className="list">{keys.length ? keys.map(k => <div key={k.id} className="row">
      <span className="grow">{k.name} <code className="dim">{k.prefix}…</code></span>
      <span className="dim small">{k.last_used_at ? `used ${new Date(k.last_used_at).toLocaleString()}` : "never used"}</span>
      <form action={revoke}><input type="hidden" name="id" value={k.id} /><button className="ghost">Revoke</button></form>
    </div>) : <div className="row dim">No keys yet.</div>}</div>
    <KeyForm />

    <h2>Webhooks</h2>
    <div className="list">{hooks.length ? hooks.map(h => <div key={h.id} className="row">
      <span className="grow">{h.url}</span>{h.events.map(e => <span key={e} className="tag">{e}</span>)}
      <span className="dim small">{h.inbox_id ? inboxes.find(i => i.id === h.inbox_id)?.address : "all inboxes"}</span>
      <form action={dropHook}><input type="hidden" name="id" value={h.id} /><button className="ghost">Remove</button></form>
    </div>) : <div className="row dim">No webhooks yet.</div>}</div>
    <HookForm events={EVENTS} inboxes={inboxes} />
    {recent.length > 0 && <><h2>Recent deliveries</h2><div className="list">{recent.map(d => <div key={d.id} className="row small">
      <span className={d.status && d.status < 300 ? "good" : "bad"}>{d.status ?? "—"}</span><span className="grow">{d.event} → {d.url}</span>
      <span className="dim">{d.attempts} tr{d.attempts === 1 ? "y" : "ies"}{d.error ? ` · ${d.error}` : ""}</span></div>)}</div></>}
  </div></>;
}
