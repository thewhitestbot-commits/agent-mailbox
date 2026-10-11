import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Nav from "../Nav";
import { needAdmin } from "@/lib/admin";
import { q } from "@/lib/db";
import { EVENTS } from "@/lib/webhooks";
import { HookForm, KeyForm } from "./Forms";
import { conf, fromServer, getDomains } from "@/lib/config";
import Setup from "./Setup";
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
  const resendKey = fromServer("RESEND_API_KEY") ? "" : await conf("RESEND_API_KEY"), inbound = await conf("INBOUND_SECRET"), provider = await conf("MAIL_PROVIDER");
  const host = headers().get("host") || "your-app.example.com", base = `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
  return <><Nav /><div className="wrap">
    <h1>Keys &amp; webhooks</h1>
    <h2>Setup</h2>
    <Setup s={{ domains: (await getDomains()).join(", "), domainsServer: fromServer("MAIL_DOMAINS"),
      resend: fromServer("RESEND_API_KEY") ? "server" : resendKey ? "saved" : "none", resendEnd: resendKey.slice(-4), storeOnly: provider === "none", providerServer: fromServer("MAIL_PROVIDER"),
      inbound: fromServer("INBOUND_SECRET") ? "server" : inbound ? "saved" : "none" }} />
    <h2>Where things connect</h2>
    <div className="card small">
      <div><b>Resend receiving:</b> in Resend → Webhooks, add <code>{base}/api/inbound/resend</code> for the <code>email.received</code> event.</div>
      <div><b>Other mail servers:</b> POST raw email to <code>{base}/api/inbound/raw</code> with <code>Authorization: Bearer &lt;inbound secret&gt;</code>.</div>
      <div><b>DNS:</b> your domain&apos;s MX record must point at your mail service (Resend shows the exact record).</div>
      <div><b>Agents:</b> REST at <code>{base}/api/v1</code>, MCP at <code>{base}/api/mcp</code> — both with an API key from below.</div>
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
