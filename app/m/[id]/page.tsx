import { redirect } from "next/navigation";
import Nav from "../../Nav";
import { needAdmin } from "@/lib/admin";
import { ApiError, getMessage, getThread, reply, updateMessage } from "@/lib/mail";
export const dynamic = "force-dynamic";

async function answer(f: FormData) {
  "use server";
  needAdmin();
  const id = String(f.get("id"));
  try { const m = await reply(id, { text: String(f.get("text") || ""), reply_all: f.get("all") === "on" }); redirect(`/m/${m.id}`); }
  catch (e) { if (e instanceof ApiError) redirect(`/m/${id}?err=${encodeURIComponent(e.message)}`); throw e; }
}
export default async function MessagePage({ params, searchParams }: { params: { id: string }; searchParams: { err?: string } }) {
  needAdmin();
  let msg; try { msg = await getMessage(params.id); } catch { redirect("/"); }
  if (msg.direction === "in" && !msg.read) await updateMessage(msg.id, { read: true });
  const thread = await getThread(msg.thread_id);
  return <><Nav /><div className="wrap">
    <p className="small"><a href={`/inbox/${msg.inbox_id}`}>← Inbox</a></p>
    <h1>{thread.subject || "(no subject)"}</h1>
    {thread.messages.map(m => <div key={m.id} className="card" style={{ marginBottom: 12, outline: m.id === msg.id ? "1px solid var(--accent)" : undefined }}>
      <div className="small"><b>{m.from}</b> <span className="dim">→ {[...m.to, ...m.cc].join(", ")}</span>
        <span className="dim" style={{ float: "right" }}>{new Date(m.created_at).toLocaleString()}</span></div>
      {m.status === "failed" && <div className="bad small">Not sent: {m.error}</div>}
      {m.labels.length > 0 && <div style={{ marginTop: 6 }}>{m.labels.map(l => <span key={l} className="tag">{l}</span>)}</div>}
      <div className="body" style={{ marginTop: 10 }}>{"text" in m ? m.text : ""}</div>
      {m.attachments.length > 0 && <div className="small" style={{ marginTop: 10 }}>{m.attachments.map(a => <a key={a.id} href={`/dl/${m.id}/${a.id}`} className="tag">📎 {a.filename} · {Math.ceil(a.bytes / 1024)} KB</a>)}</div>}
    </div>)}
    <h2>Reply</h2>
    <form action={answer} className="card grid">
      <input type="hidden" name="id" value={msg.id} />
      <textarea name="text" placeholder="Your reply" required />
      <label className="small dim"><input type="checkbox" name="all" style={{ width: "auto", marginRight: 6 }} />Reply to everyone</label>
      {searchParams.err && <div className="bad small">{searchParams.err}</div>}
      <div><button>Send reply</button></div>
    </form>
  </div></>;
}
